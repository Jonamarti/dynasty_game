# M15 phase 14c — autonomous garment removal in heat

An autonomous adult may take off a proven insulating garment when outdoor
temperature is clearly warm and the existing cold meter is almost settled.
This reuses the `take_off_garment` Kit action and its short equipment timer;
ownership stays in inventory. The scorer reads the person's own positive
`warm:<item>` belief, validates the garment's declared slot and ownership, and
does not remove dedicated hide or technology-gated armour. The player keeps
control of their outfit.

The game has no overheating need. This rule therefore recognizes a narrow
thermal condition the current model can establish: the weather is warm and the
person's accumulated cold has nearly been relieved. It does not assert heat
stress or a survival benefit. Wetness and swimming alone cannot trigger it in
cold weather because the outdoor temperature gate remains in force.

The provisional `AiConfig` settings are `garmentHeatTemperature: 0.45`,
`garmentHeatCold: 3`, and `garmentHeatWeight: 1.1`. They are tuning assumptions,
not calibrated adoption targets. A checkpoint written before these settings
receives these defaults only when its whole AI settings shape is recognized;
partial settings remain invalid. The scorer keeps no timer or memory, so once a
layer is removed it is not put back on until the independent cold-wear rule
crosses its much higher threshold. If social learning later overwrites the
belief source, removal waits for another own-source warmth observation.

## Verification

`garment-heat-removal.test.ts` covers the real Kit timer, garment conservation,
no removal while cold is still high, in cold weather, on public or zero warmth
evidence, dedicated armour retention, player outfit authority, and no immediate
redressing. The primary test fails on the previous Brain because it produces no
`take_off_garment` candidate. `checkpoint-records.test.ts` covers both recognized
older AI shapes and rejects partial heat settings.

No new UI was added. The existing Kit is captured as a milestone record; it is not a visual test of autonomous heat removal. This slice has not run the heavy
verification matrix or any survival cohort; its defaults are not a measured
claim of better comfort or survival.
