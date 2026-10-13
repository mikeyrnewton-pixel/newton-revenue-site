import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const home=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('primary route is a real direct email link',()=>{assert.ok(home.includes('<a class="btn primary" href="mailto:newtonrevenue@gmail.com?subject=Newton%20Revenue%20enquiry">'))});
test('original form and privacy policy remain unchanged',()=>{assert.ok(home.includes('<form id="enquiry-form"'));assert.ok(home.includes('href="/privacy.html"'))});
test('existing free checker and human fallback are still present',()=>{assert.ok(home.includes('href="/enquiry-check/"'));assert.ok(home.includes('newtonrevenue@gmail.com'))});
