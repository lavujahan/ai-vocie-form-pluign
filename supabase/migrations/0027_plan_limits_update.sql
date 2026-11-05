-- New plan limits (prices unchanged). Running periods keep the minutes and limits they started with
-- (subscriptions copies them); these apply from each user's next renewal, or edit a user's current period
-- with Admin → Users → Plan → Add extra.
--
--             minutes  Voice Form Fill QR  Non Voice Form Fill QR  documents  computers
--   trial        15            10                   10                 20          1
--   starter      60            40                  120                200          1
--   basic       150           100                  250                300          1
--   pro         400           300                  450                600          2
--   business   1000           800                 1250               1500          3

update public.plans set minutes = 15,   voice_qrs = 10,  nonvoice_qrs = 10,   documents = 20,   computers = 1, updated_at = now() where id = 'trial';
update public.plans set minutes = 60,   voice_qrs = 40,  nonvoice_qrs = 120,  documents = 200,  computers = 1, updated_at = now() where id = 'starter';
update public.plans set minutes = 150,  voice_qrs = 100, nonvoice_qrs = 250,  documents = 300,  computers = 1, updated_at = now() where id = 'basic';
update public.plans set minutes = 400,  voice_qrs = 300, nonvoice_qrs = 450,  documents = 600,  computers = 2, updated_at = now() where id = 'pro';
update public.plans set minutes = 1000, voice_qrs = 800, nonvoice_qrs = 1250, documents = 1500, computers = 3, updated_at = now() where id = 'business';
