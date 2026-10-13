import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/enquiry-diagnostic/index.html',import.meta.url),'utf8');
test('page heading, mobile viewport and correct canonical',()=>{assert.match(html,/lang="en-GB"/);assert.match(html,/name="viewport"/);assert.equal((html.match(/<h1\b/g)||[]).length,1);assert.match(html,/https:\/\/newton-revenue-site\.pages\.dev\/enquiry-diagnostic\//)});
test('commercial terms stay conditional and bounded',()=>{for(const s of ['£195','two working days','up to 20','tax treatment','No login credentials','written agreement'])assert.ok(html.includes(s),s)});
test('safe email contact and link back to existing policies',()=>{assert.match(html,/mailto:newtonrevenue@gmail\.com/);assert.match(html,/href="\/privacy\.html"/);assert.match(html,/href="\/enquiry-check\/"/)});
test('never asks for customer records through public intake',()=>{assert.doesNotMatch(html,/<form\b|<script\b|facebook\.net|google-analytics|hotjar/i);assert.match(html,/Please don't send customer personal data/)});
test('responsive grid and no invented testimonials',()=>{assert.match(html,/@media\(max-width:700px\)/);assert.doesNotMatch(html,/<blockquote|testimonials|customer reviews/i)});
