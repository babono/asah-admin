/**
 * Generates src/lib/database.types.ts from asah-be's migrations, without a
 * Supabase project or Docker: the migrations run in PGlite (Postgres in WASM)
 * and the schema is read back from the catalog. The output follows the
 * `supabase gen types typescript` format, so supabase-js infers selects,
 * embeds and RPCs the same way.
 *
 *   npm run gen:types                         # ../asah-be/supabase/migrations
 *   ASAH_BE_DIR=/path/to/asah-be npm run gen:types
 *
 * Once a project is linked, `npm run gen:types:remote` gives the same result.
 */
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const beDir = resolve(process.env.ASAH_BE_DIR ?? join(process.cwd(), "..", "asah-be"));
const migrationsDir = join(beDir, "supabase", "migrations");
const outFile = join(process.cwd(), "src", "lib", "database.types.ts");

/** What Supabase provides and the migrations expect. */
const supabaseStub = `
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
  end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, phone text, email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create schema if not exists extensions;
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(),
  bucket_id text, name text);
create or replace function storage.foldername(name text) returns text[] language sql immutable
  as $$ select string_to_array(name, '/') $$;
create schema if not exists vault;
create table if not exists vault.decrypted_secrets (name text, decrypted_secret text);
create schema if not exists net;
create or replace function net.http_post(url text, headers jsonb, body jsonb) returns bigint
  language sql as $$ select 0::bigint $$;
`;

/** Statements PGlite cannot run and that do not change the public schema. */
function adapt(sql: string): string {
  return sql
    .replace(/^\s*create extension[^;]*;/gim, "")
    .replace(/^\s*alter publication[^;]*;/gim, "");
}

type Col = { table: string; name: string; type: string; elem: string | null; nullable: boolean; hasDefault: boolean; identity: string; generated: string; kind: string };

async function main() {
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  if (files.length === 0) throw new Error(`No migrations in ${migrationsDir}`);

  const db = new PGlite();
  await db.exec(supabaseStub);
  for (const f of files) {
    await db.exec(adapt(readFileSync(join(migrationsDir, f), "utf8")));
  }

  const enums = (
    await db.query<{ name: string; labels: string[] }>(`
      select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as labels
      from pg_type t join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' group by t.typname order by t.typname`)
  ).rows;
  const enumNames = new Set(enums.map((e) => e.name));

  const cols = (
    await db.query<Col>(`
      select c.relname as table, a.attname as name, t.typname as type,
             et.typname as elem, not a.attnotnull as nullable, a.atthasdef as "hasDefault",
             a.attidentity as identity, a.attgenerated as generated, c.relkind as kind
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_type t on t.oid = a.atttypid
      left join pg_type et on et.oid = t.typelem and t.typcategory = 'A'
      where n.nspname = 'public' and c.relkind in ('r', 'v') and a.attnum > 0 and not a.attisdropped
      order by c.relname, a.attnum`)
  ).rows;

  const fks = (
    await db.query<{ table: string; name: string; columns: string[]; ref: string; refColumns: string[]; oneToOne: boolean }>(`
      select c.relname as table, con.conname as name,
             array(select attname from pg_attribute where attrelid = con.conrelid and attnum = any(con.conkey) order by attnum) as columns,
             rc.relname as ref,
             array(select attname from pg_attribute where attrelid = con.confrelid and attnum = any(con.confkey) order by attnum) as "refColumns",
             exists (select 1 from pg_constraint u where u.conrelid = con.conrelid and u.contype in ('p', 'u')
                     and u.conkey::int[] @> con.conkey::int[] and u.conkey::int[] <@ con.conkey::int[]) as "oneToOne"
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_class rc on rc.oid = con.confrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_namespace rn on rn.oid = rc.relnamespace
      where con.contype = 'f' and n.nspname = 'public' and rn.nspname = 'public'
      order by c.relname, con.conname`)
  ).rows;

  const fns = (
    await db.query<{ name: string; argNames: string[] | null; argTypes: string[]; nDefaults: number; returns: string; retset: boolean; outNames: string[] | null; outTypes: string[] | null }>(`
      select p.proname as name, p.proargnames as "argNames",
             array(select format_type(t, null) from unnest(p.proargtypes) t) as "argTypes",
             p.pronargdefaults as "nDefaults", format_type(p.prorettype, null) as returns, p.proretset as retset,
             (select array_agg(p.proargnames[i] order by i) from generate_subscripts(p.proargmodes, 1) i where p.proargmodes[i] = 't') as "outNames",
             (select array_agg(format_type(p.proallargtypes[i], null) order by i) from generate_subscripts(p.proargmodes, 1) i where p.proargmodes[i] = 't') as "outTypes"
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f' and format_type(p.prorettype, null) <> 'trigger'
      order by p.proname`)
  ).rows;

  const ts = (pgType: string): string => {
    const t = pgType.replace(/^public\./, "").replace(/"/g, "");
    if (t.endsWith("[]")) return `${ts(t.slice(0, -2))}[]`;
    if (enumNames.has(t)) return `Database["public"]["Enums"]["${t}"]`;
    if (/^(int2|int4|int8|smallint|integer|bigint|numeric|float4|float8|real|double precision|oid)/.test(t)) return "number";
    if (/^(bool|boolean)$/.test(t)) return "boolean";
    if (/^(json|jsonb)$/.test(t)) return "Json";
    if (t === "void") return "undefined";
    if (t === "record") return "Record<string, unknown>";
    return "string";
  };
  const colType = (c: Col) => (c.elem ? `${ts(c.elem)}[]` : ts(c.type));

  const byTable = new Map<string, Col[]>();
  for (const c of cols) byTable.set(c.table, [...(byTable.get(c.table) ?? []), c]);

  const rels = (table: string) => {
    const list = fks.filter((f) => f.table === table);
    if (list.length === 0) return "[]";
    return `[\n${list
      .map(
        (f) => `          {
            foreignKeyName: "${f.name}"
            columns: [${f.columns.map((c) => `"${c}"`).join(", ")}]
            isOneToOne: ${f.oneToOne}
            referencedRelation: "${f.ref}"
            referencedColumns: [${f.refColumns.map((c) => `"${c}"`).join(", ")}]
          },`,
      )
      .join("\n")}\n        ]`;
  };

  const relation = (table: string, view: boolean) => {
    const c = byTable.get(table)!;
    const row = c.map((x) => `          ${x.name}: ${colType(x)}${x.nullable ? " | null" : ""}`).join("\n");
    const ins = c
      .map((x) => {
        if (x.identity === "a" || x.generated === "s") return `          ${x.name}?: never`;
        const optional = x.nullable || x.hasDefault || x.identity === "d";
        return `          ${x.name}${optional ? "?" : ""}: ${colType(x)}${x.nullable ? " | null" : ""}`;
      })
      .join("\n");
    const upd = c
      .map((x) =>
        x.identity === "a" || x.generated === "s"
          ? `          ${x.name}?: never`
          : `          ${x.name}?: ${colType(x)}${x.nullable ? " | null" : ""}`,
      )
      .join("\n");
    const viewRow = c.map((x) => `          ${x.name}: ${colType(x)} | null`).join("\n");
    return view
      ? `      ${table}: {\n        Row: {\n${viewRow}\n        }\n        Relationships: []\n      }`
      : `      ${table}: {\n        Row: {\n${row}\n        }\n        Insert: {\n${ins}\n        }\n        Update: {\n${upd}\n        }\n        Relationships: ${rels(table)}\n      }`;
  };

  const tables = [...byTable.keys()].filter((t) => byTable.get(t)![0].kind === "r");
  const views = [...byTable.keys()].filter((t) => byTable.get(t)![0].kind === "v");

  const fn = (f: (typeof fns)[number]) => {
    const names = (f.argNames ?? []).slice(0, f.argTypes.length);
    const firstOptional = f.argTypes.length - f.nDefaults;
    const args =
      f.argTypes.length === 0
        ? "never"
        : `{\n${f.argTypes.map((t, i) => `          ${names[i]}${i >= firstOptional ? "?" : ""}: ${ts(t)}`).join("\n")}\n        }`;
    let ret: string;
    if (f.outNames && f.outTypes) {
      ret = `{\n${f.outNames.map((n, i) => `          ${n}: ${ts(f.outTypes![i])}`).join("\n")}\n        }[]`;
    } else {
      ret = ts(f.returns) + (f.retset ? "[]" : "");
    }
    return `      ${f.name}: {\n        Args: ${args}\n        Returns: ${ret}\n      }`;
  };

  const out = `// Generated by scripts/gen-types.ts from asah-be/supabase/migrations. Do not edit.
// Regenerate: npm run gen:types

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12"
  }
  public: {
    Tables: {
${tables.map((t) => relation(t, false)).join("\n")}
    }
    Views: {
${views.map((t) => relation(t, true)).join("\n")}
    }
    Functions: {
${fns.map(fn).join("\n")}
    }
    Enums: {
${enums.map((e) => `      ${e.name}: ${e.labels.map((l) => `"${l}"`).join(" | ")}`).join("\n")}
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof (PublicSchema["Tables"] & PublicSchema["Views"])> =
  (PublicSchema["Tables"] & PublicSchema["Views"])[T] extends { Row: infer R } ? R : never
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T]
`;
  writeFileSync(outFile, out);
  console.log(`Wrote ${outFile}: ${tables.length} tables, ${views.length} views, ${fns.length} functions, ${enums.length} enums`);
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
