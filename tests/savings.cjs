const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

process.env.TZ = 'America/Los_Angeles';
const script = fs.readFileSync(`${__dirname}/../index.html`, 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function app(now = '2026-10-19T12:00:00-07:00', stored = {}) {
    let time = now;
    const nodes = new Map();
    const node = key => {
        if (!nodes.has(key)) nodes.set(key, { textContent: '', style: {}, classList: { add() {}, remove() {} } });
        return nodes.get(key);
    };
    class Clock extends Date {
        constructor(...args) { super(...(args.length ? args : [time])); }
    }
    const context = vm.createContext({
        Date: Clock,
        localStorage: { getItem: key => stored[key] ?? null, setItem: (key, value) => { stored[key] = String(value); } },
        document: { getElementById: node, querySelector: node, body: node('body'), addEventListener() {} },
        window: { requestAnimationFrame() {}, addEventListener() {} },
        setInterval() {},
    });
    vm.runInContext(script, context);
    return { context, node, setTime: value => { time = value; }, run: code => vm.runInContext(code, context) };
}

test('default beer, cigarette, and combined savings use 155 local calendar days', () => {
    const a = app();
    assert.equal(a.node('#sobrietyDaysCard .card-value').textContent, 155);
    assert.equal(a.node('#sobrietySaved .card-value').textContent, '$2315.70');
    assert.equal(a.node('#smokingSaved .card-value').textContent, '$1581.00');
    assert.equal(a.node('totalSaved').textContent, 'Total Saved: $3896.70');
    assert.equal(a.node('sobrietyDate').textContent, 'Started: May 17, 2026');
});

test('calendar days handle spring and fall daylight saving changes', () => {
    assert.equal(app('2026-03-09T12:00:00-07:00').run('daysSince("2026-03-08")'), 1);
    assert.equal(app('2026-11-02T12:00:00-08:00').run('daysSince("2026-11-01")'), 1);
    assert.equal(app().run('daysSince("2026-10-20")'), 0);
});

test('custom rates and separate dates calculate independently', () => {
    const a = app(undefined, { sobriety: '2026-10-09', smoking: '2026-10-14', beersPerDay: '2', costPerBeer: '3.25', cigarettesPerDay: '10', costPerPack: '12' });
    assert.equal(a.node('#sobrietySaved .card-value').textContent, '$65.00');
    assert.equal(a.node('#smokingSaved .card-value').textContent, '$30.00');
    assert.equal(a.node('totalSaved').textContent, 'Total Saved: $95.00');
});

test('invalid stored rates fall back while explicit zero remains valid', () => {
    const a = app(undefined, { beersPerDay: '', costPerBeer: 'NaN', cigarettesPerDay: '-1', costPerPack: 'Infinity' });
    assert.equal(a.node('totalSaved').textContent, 'Total Saved: $3896.70');
    assert.equal(app(undefined, { beersPerDay: '0', cigarettesPerDay: '0' }).node('totalSaved').textContent, 'Total Saved: $0.00');
});

test('an open app refreshes both savings after midnight', () => {
    const a = app('2026-10-18T23:59:00-07:00');
    a.setTime('2026-10-19T00:01:00-07:00');
    a.run('refreshIfDayChanged()');
    assert.equal(a.node('#sobrietySaved .card-value').textContent, '$2315.70');
    assert.equal(a.node('#smokingSaved .card-value').textContent, '$1581.00');
});
