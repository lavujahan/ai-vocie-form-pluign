import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Select from 'react-select';
import AsyncSelect from 'react-select/async';
import Autocomplete from '@mui/material/Autocomplete';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import MuiSelect from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Choices from 'choices.js';
import 'choices.js/public/assets/styles/choices.min.css';
import jQuery from 'jquery';
// @ts-expect-error select2 ships no types; its CommonJS entry is a factory (root, jQuery)
import select2 from 'select2';
import 'select2/dist/css/select2.min.css';

/** Everything the widgets hold, as the page's own code sees it (checked by Playwright). */
const state: Record<string, unknown> = {};
const echo = () => {
  state.relationship = (document.getElementById('relationship') as HTMLSelectElement).value;
  state.religion = (document.getElementById('religion') as HTMLSelectElement).value;
  state.village = (document.getElementById('village') as HTMLSelectElement).value;
  document.getElementById('state-echo')!.textContent = JSON.stringify(state);
};

const opts = (labels: string[]) => labels.map((l) => ({ value: l.toLowerCase().replace(/\s+/g, '_'), label: l }));
const DISTRICTS = opts(['Chennai', 'Coimbatore', 'Salem', 'Thiruvallur', 'Tiruchirappalli', 'Madurai']);
const LANGUAGES = opts(['Tamil', 'English', 'Hindi', 'Telugu', 'Malayalam']);
const TALUKS = opts(['Omalur', 'Attur', 'Edappadi', 'Mettur', 'Valappady', 'Pethanaickenpalayam']);
const COMMUNITIES = ['BC', 'MBC', 'SC', 'ST', 'OC'];

/** Like a server search: only names containing what was typed, after a delay. */
const searchTaluks = (q: string) =>
  new Promise<typeof TALUKS>((r) => setTimeout(() => r(TALUKS.filter((t) => t.label.toLowerCase().includes(q.toLowerCase()))), 250));

function App() {
  const [, rerender] = useState(0);
  const set = (k: string, v: unknown) => {
    state[k] = v;
    echo();
    rerender((n) => n + 1);
  };
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <label htmlFor="district-input">District</label>
      <Select inputId="district-input" name="district" options={DISTRICTS} onChange={(o) => set('district', o?.value ?? '')} isClearable />

      <label htmlFor="languages-input">Languages known</label>
      <Select
        inputId="languages-input"
        name="languages"
        options={LANGUAGES}
        isMulti
        onChange={(list) => set('languages', list.map((o) => o.value))}
      />

      <label htmlFor="taluk-input">Taluk</label>
      <AsyncSelect
        inputId="taluk-input"
        name="taluk"
        cacheOptions
        defaultOptions
        loadOptions={searchTaluks}
        onChange={(o) => set('taluk', o?.value ?? '')}
        isClearable
      />

      <div className="row">
        <Autocomplete
          id="community"
          options={COMMUNITIES}
          onChange={(_e, v) => set('community', v ?? '')}
          renderInput={(params) => <TextField {...params} label="Community" />}
        />
      </div>

      <div className="row">
        <FormControl fullWidth>
          <InputLabel id="gender-label">Gender</InputLabel>
          <MuiSelect
            labelId="gender-label"
            id="gender"
            name="gender"
            label="Gender"
            value={(state.gender as string) ?? ''}
            onChange={(e) => set('gender', e.target.value)}
          >
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            <MenuItem value="M">Male</MenuItem>
            <MenuItem value="F">Female</MenuItem>
            <MenuItem value="T">Transgender</MenuItem>
          </MuiSelect>
        </FormControl>
      </div>
    </form>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

new Choices('#relationship', { shouldSort: false, itemSelectText: '' });
document.getElementById('relationship')!.addEventListener('change', echo);

select2(window, jQuery);
// select2 adds itself to jQuery at runtime; the fixture doesn't need its types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const $ = jQuery as unknown as (selector: string) => any;
$('#religion').select2({ placeholder: 'Select religion', allowClear: true, width: '100%' }).on('change', echo);
// `_resultId` works around a select2 4.1 bug that only shows in strict-mode bundles like this fixture
// (it calls _normalizeItem without `this`); real pages load select2 as a classic script.
const VILLAGES = ['Ponneri', 'Thulasampatti', 'Thulasampatti Pudur', 'Kanniyampatti'].map((t, i) => ({
  id: `V${i + 1}`,
  text: t,
  _resultId: `select2-village-result-V${i + 1}`,
}));
$('#village')
  .select2({
    placeholder: 'Search village',
    allowClear: true,
    width: '100%',
    ajax: {
      delay: 100,
      // Stand-in for a server: answers after 300 ms with the villages containing the search.
      transport: (params: { data: { term?: string } }, success: (d: unknown) => void) => {
        const q = (params.data.term ?? '').toLowerCase();
        const t = setTimeout(() => success({ results: VILLAGES.filter((v) => v.text.toLowerCase().includes(q)) }), 300);
        return { abort: () => clearTimeout(t) };
      },
    },
  })
  .on('change', echo);
echo();
