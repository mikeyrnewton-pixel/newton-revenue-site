import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const home=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
test('primary customer route is reliable business email',()=>{assert.match(home,/<a class="btn primary" href="mailto:newtonrevenue@gmail\\.com\\?subject=Newton%20Revenue%20enquiry"/)});
test('existing enquiry form remains present and privacy notices intact',()=>{assert.match(home,/<form id="enquiry-form"/);assert.match(home,/href="\\/privacy\\.html"/)});
test('free checker and human contact remain available',()=>{assert.match(home,/href="\\/enquiry-check\\/"/);assert.match(home,/newtonrevenue@gmail\\.com/)});
