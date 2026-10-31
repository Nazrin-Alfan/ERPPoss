# Confirmed negative probes

## QA-CSV-01 — P2: Formula-capable input is not neutralized in CSV

Catalog: RES-04 (also FIN-07). Source: `src/utils/financeHelpers.js:296`.

Reproduce with the real helper:

```js
generateCSVString([{label:'Keterangan',key:'description'}], [{description:'=1+1'}])
```

Actual data row is `"=1+1"`. Quoting protects CSV structure but does not neutralize spreadsheet formulas. Expected: user-controlled formula-leading text is exported as inert text using an agreed spreadsheet-safe rule. This probe proves exported content only; no spreadsheet was opened and no remote payload was invoked.

## QA-REWARD-01 — P1: Reward service accepts ineligible and repeated claims

Catalog: CRM-04. Source: `src/services/crmService.js:510` (`redeemCustomerReward`).

On fresh isolated `createLocalClient()` after reset, choose previously unseen plate `QA 0000 ZZ`, then call `redeemCustomerReward(db,{tenant_id:DEFAULT_TENANT_ID,plat:'QA 0000 ZZ',reward_title:'QA TEST'})` twice. Query `crm_loyalty_logs` by plate.

Actual: both calls succeed and two redemption rows exist although there are zero qualifying visits. Expected: eligibility is checked at the mutation boundary and replay/concurrent duplicate claims cannot consume the same entitlement twice. UI gating alone does not prove an atomic eligibility guarantee. This is confirmed on the direct local service; hosted SQL policies and browser stale-tab exploitation were not tested in this probe. Keep the deliberate authentication mock distinction explicit; no mock was deleted or changed.

Reproduction command: `node /workspace/scratch/qa-campaign/negative-probes.mjs`. The probe exits0 only if the observed defect shapes still reproduce, and writes `negative-probe-results.json`; it is a diagnostic reproduction, NOT a passing regression test of intended business behavior.
