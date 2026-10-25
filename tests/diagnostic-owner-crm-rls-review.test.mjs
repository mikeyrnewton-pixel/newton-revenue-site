import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const draft=readFileSync(new URL("../docs/ATLAS_DIAGNOSTIC_OWNER_CRM_RLS_20261025.sql.review",
  import.meta.url),"utf8");
// Audit executable statements separately from explanatory SQL comments.
const statements=draft.split("\n").filter(line=>!line.trimStart().startsWith("--")).join("\n");

test("private CRM SQL remains inert review material, not deployable from repository",()=>{
  assert.match(draft,/REVIEW-ONLY: not a migration, do NOT execute/);
  assert.equal((draft.match(/__VERIFIED_OWNER_AUTH_UUID__/g)||[]).length,5);
  assert.equal((draft.match(/^BEGIN;$/gm)||[]).length,1);
  assert.equal((draft.match(/^COMMIT;$/gm)||[]).length,1);
  assert.match(draft,/auth\.users WHERE id = owner_uid/);
  assert.doesNotMatch(statements,/\b(?:CREATE|ALTER|DROP)\s+(?:DATABASE|ROLE|USER)\b/i);
  assert.doesNotMatch(statements,/\b(?:TRUNCATE|DELETE FROM|DROP TABLE)\b/i);
});
test("cutover refuses nonempty table, a changed policy set and missing RLS",()=>{
  assert.match(draft,/EXISTING_CRM_ROWS_REQUIRE_REVIEW_AND_DATA_MIGRATION/);
  assert.match(draft,/CRM_POLICIES_CHANGED_SINCE_REVIEW/);
  assert.match(draft,/CRM_RLS_NOT_ENABLED/);
  assert.match(draft,/OWNERSHIP_COLUMN_ALREADY_EXISTS/);
  assert.match(draft,/ADD COLUMN owner_user_id uuid NOT NULL/);
});
test("existing broad grants are revoked and only owner CRUD-minus-delete operations survive",()=>{
  assert.match(draft,/REVOKE ALL PRIVILEGES ON TABLE public\.newton_opportunities FROM anon, authenticated;/);
  assert.match(draft,/GRANT SELECT, INSERT, UPDATE ON TABLE public\.newton_opportunities TO authenticated;/);
  assert.doesNotMatch(draft,/GRANT [^\n]* TO anon;/i);
  assert.doesNotMatch(draft,/GRANT [^\n]*DELETE[^\n]* TO authenticated;/i);
  assert.equal((draft.match(/CREATE POLICY atlas_owner_only_/g)||[]).length,3);
  for(const action of ["select","insert","update"]){
    const policy=draft.match(new RegExp("CREATE POLICY atlas_owner_only_"+action+"\\b([\\s\\S]*?);"));
    assert.ok(policy,action+" policy missing");
    assert.match(policy[1],new RegExp("FOR "+action+" TO authenticated","i"));
    assert.match(policy[1],/owner_user_id = \(select auth\.uid\(\)\)/);
    assert.match(policy[1],/auth\.uid\(\)\) = '__VERIFIED_OWNER_AUTH_UUID__'::uuid/);
    assert.match(policy[1],/is_anonymous/);
  }
  assert.match(draft,/FOR INSERT TO authenticated\s+WITH CHECK/);
  assert.match(draft,/FOR UPDATE TO authenticated\s+USING[\s\S]*WITH CHECK/);
});
test("migration plan does not grant buyer contact, live payment or bypass privacy",()=>{
  assert.match(draft,/database row access.*NOT permission for external outreach/i);
  assert.match(draft,/service-role key bypasses RLS/);
  assert.match(draft,/Non-owner authenticated test account/);
  assert.match(draft,/No automatic rollback/);
  assert.doesNotMatch(draft,/(?:sk_|sb_secret_|service_role_[A-Za-z0-9]{10,}|password\s*=\s*'[^']+')/i);
});
