import type { RecentSpeech } from '../lib/agents/fieldMapper';
import type { AgentField } from '../lib/agents/tools';

/** The form every eval case is mapped against. */
export const EVAL_FORM: AgentField[] = [
  { field_key: 'full_name', label: 'Full name', field_type: 'text', required: true, options: [], semantic_type: 'full_name' },
  { field_key: 'email', label: 'Email', field_type: 'email', required: true, options: [], semantic_type: 'email' },
  { field_key: 'phone', label: 'Mobile number', field_type: 'tel', required: true, options: [], semantic_type: 'phone' },
  { field_key: 'dob', label: 'Date of birth', field_type: 'date', required: false, options: [], semantic_type: 'date_of_birth' },
  {
    field_key: 'gender',
    label: 'Gender',
    field_type: 'radio',
    required: false,
    semantic_type: 'gender',
    options: [
      { value: 'm', label: 'Male' },
      { value: 'f', label: 'Female' },
      { value: 'o', label: 'Other' },
    ],
  },
  {
    field_key: 'marital',
    label: 'Marital status',
    field_type: 'select',
    required: false,
    semantic_type: 'marital_status',
    options: [
      { value: 'single', label: 'Single' },
      { value: 'married', label: 'Married' },
      { value: 'divorced', label: 'Divorced' },
    ],
  },
  { field_key: 'city', label: 'City', field_type: 'text', required: false, options: [], semantic_type: 'city' },
  {
    field_key: 'state',
    label: 'State',
    field_type: 'select',
    required: false,
    semantic_type: 'state',
    options: [
      { value: 'TN', label: 'Tamil Nadu' },
      { value: 'KL', label: 'Kerala' },
      { value: 'KA', label: 'Karnataka' },
    ],
  },
  { field_key: 'pincode', label: 'PIN code', field_type: 'text', required: false, options: [], semantic_type: 'pincode' },
  { field_key: 'address', label: 'Address', field_type: 'textarea', required: false, options: [], semantic_type: 'address' },
  { field_key: 'gst', label: 'GST number', field_type: 'text', required: false, options: [], semantic_type: 'gst' },
  { field_key: 'newsletter', label: 'Subscribe to newsletter', field_type: 'checkbox', required: false, options: [], semantic_type: 'boolean' },
  { field_key: 'name_ta', label: 'Name in Tamil', field_type: 'text', required: false, options: [], semantic_type: 'full_name', output_script: 'ta' },
];

export type EvalTag = 'english' | 'tanglish' | 'tamil' | 'field' | 'can' | 'corrections' | 'commands';

export type EvalCase = {
  speech: string;
  tags: EvalTag[];
  /** Which form the case is mapped against (default: EVAL_FORM). */
  form?: 'can';
  target?: string;
  current?: Record<string, string>;
  /** What was said just before (corrections that don't name the field). */
  recent?: RecentSpeech[];
  /**
   * Expected values; a list means any of these spellings is right; `null` means the field must NOT be
   * returned. Fields not listed are not checked.
   */
  expect: Record<string, string | string[] | null>;
};

/**
 * Like the CAN (Community / Applicant) registration form on tnedistrict: Taluk and Village are
 * cascading dropdowns whose options load later ("not loaded yet" for the mapper).
 */
export const CAN_FORM: AgentField[] = [
  { field_key: 'applicant_name', label: 'Applicant name', field_type: 'text', required: true, options: [], semantic_type: 'full_name' },
  { field_key: 'father_name', label: 'Father / Husband name', field_type: 'text', required: true, options: [], semantic_type: 'full_name' },
  {
    field_key: 'gender',
    label: 'Gender',
    field_type: 'select',
    required: true,
    semantic_type: 'gender',
    options: [
      { value: 'M', label: 'Male' },
      { value: 'F', label: 'Female' },
      { value: 'T', label: 'Transgender' },
    ],
  },
  { field_key: 'dob', label: 'Date of birth', field_type: 'date', required: true, options: [], semantic_type: 'date_of_birth' },
  { field_key: 'mobile', label: 'Mobile number', field_type: 'tel', required: true, options: [], semantic_type: 'phone' },
  { field_key: 'aadhaar', label: 'Aadhaar number', field_type: 'text', required: false, options: [], semantic_type: 'aadhaar' },
  {
    field_key: 'community',
    label: 'Community',
    field_type: 'select',
    required: true,
    semantic_type: 'choice',
    options: [
      { value: 'BC', label: 'Backward Class (BC)' },
      { value: 'MBC', label: 'Most Backward Class (MBC)' },
      { value: 'SC', label: 'Scheduled Caste (SC)' },
      { value: 'ST', label: 'Scheduled Tribe (ST)' },
      { value: 'OC', label: 'Other Community (OC)' },
    ],
  },
  {
    field_key: 'religion',
    label: 'Religion',
    field_type: 'select',
    required: false,
    semantic_type: 'choice',
    options: [
      { value: 'HI', label: 'Hindu' },
      { value: 'MU', label: 'Muslim' },
      { value: 'CH', label: 'Christian' },
      { value: 'OT', label: 'Others' },
    ],
  },
  { field_key: 'door_no', label: 'Door no', field_type: 'text', required: false, options: [], semantic_type: 'address' },
  { field_key: 'street', label: 'Street', field_type: 'text', required: false, options: [], semantic_type: 'address' },
  { field_key: 'pincode', label: 'Pincode', field_type: 'text', required: true, options: [], semantic_type: 'pincode' },
  {
    field_key: 'district',
    label: 'District',
    field_type: 'select',
    required: true,
    semantic_type: 'district',
    options: ['Chennai', 'Coimbatore', 'Salem', 'Thiruvallur', 'Madurai'].map((d) => ({ value: d.toUpperCase(), label: d })),
  },
  { field_key: 'taluk', label: 'Taluk', field_type: 'select', required: true, options: [], semantic_type: 'choice' },
  { field_key: 'village', label: 'Revenue village', field_type: 'select', required: true, options: [], semantic_type: 'choice' },
];

const FATHER_JAGADEESAN = ['Jagadeesan', 'Jagadheesan', 'Jagatheesan', 'Jegadeesan'];

export const EVAL_CASES: EvalCase[] = [
  // English
  { tags: ['english'], speech: 'My name is Ramesh Kumar, email ramesh@gmail.com, phone 9876543210', expect: { full_name: 'Ramesh Kumar', email: 'ramesh@gmail.com', phone: '9876543210' } },
  { tags: ['english'], speech: 'Email is priya underscore s at yahoo dot co dot in', expect: { email: 'priya_s@yahoo.co.in', full_name: null } },
  { tags: ['english'], speech: 'phone number double nine eight four triple zero one two three', expect: { phone: '9984000123' } },
  { tags: ['english'], speech: 'I was born on 15th March 1990', expect: { dob: '1990-03-15' } },
  { tags: ['english'], speech: 'I am female and single', expect: { gender: 'Female', marital: 'Single' } },
  { tags: ['english'], speech: 'City Coimbatore, state Tamil Nadu, pincode six four one zero zero one', expect: { city: 'Coimbatore', state: 'Tamil Nadu', pincode: '641001' } },
  { tags: ['english'], speech: 'GST number is 33 ABCDE 1234 F 1 Z 5', expect: { gst: '33ABCDE1234F1Z5' } },
  { tags: ['english'], speech: 'Yes, subscribe me to the newsletter', expect: { newsletter: 'true' } },
  { tags: ['english'], speech: "Don't subscribe me to the newsletter", expect: { newsletter: 'false' } },
  { tags: ['english'], speech: 'Change the phone to 9123456780', current: { phone: '9876543210' }, expect: { phone: '9123456780', email: null } },
  { tags: ['english'], speech: 'Clear the city', current: { city: 'Chennai' }, expect: { city: '' } },
  { tags: ['english'], speech: 'The weather is nice today', expect: { full_name: null, city: null } },
  // Tanglish
  { tags: ['tanglish'], speech: 'en peru Ramesh Kumar, ooru Chennai', expect: { full_name: 'Ramesh Kumar', city: 'Chennai' } },
  { tags: ['tanglish'], speech: 'naan aan, kalyanam aachu', expect: { gender: 'Male', marital: 'Married' } },
  { tags: ['tanglish'], speech: 'en email ramesh at gmail dot com, phone number onbadhu ettu ezhu aaru anju naalu moonu rendu onnu poojyam', expect: { email: 'ramesh@gmail.com', phone: '9876543210' } },
  { tags: ['tanglish'], speech: 'naan Madurai la irukken, state Tamil Nadu', expect: { city: 'Madurai', state: 'Tamil Nadu' } },
  { tags: ['tanglish'], speech: 'kalyanam aagala, naan penn', expect: { marital: 'Single', gender: 'Female' } },
  { tags: ['tanglish'], speech: 'pirandha naal 2 June 1985', expect: { dob: '1985-06-02' } },
  { tags: ['tanglish'], speech: 'newsletter venam', expect: { newsletter: 'false' } },
  { tags: ['tanglish'], speech: 'phone number maathunga, puthu number 9000012345', current: { phone: '9876543210' }, expect: { phone: '9000012345' } },
  // Tamil script
  { tags: ['tamil'], speech: 'என் பெயர் ரமேஷ் குமார்', expect: { full_name: 'Ramesh Kumar', name_ta: 'ரமேஷ் குமார்' } },
  { tags: ['tamil'], speech: 'நான் சென்னையில் வசிக்கிறேன்', expect: { city: 'Chennai' } },
  { tags: ['tamil'], speech: 'என் பிறந்த தேதி 15 ஆம் தேதி மார்ச் 1990', expect: { dob: '1990-03-15' } },
  { tags: ['tamil'], speech: 'நான் ஆண், திருமணமானவர்', expect: { gender: 'Male', marital: 'Married' } },
  { tags: ['tamil'], speech: 'போன் நம்பர் ஒன்பது எட்டு ஏழு ஆறு ஐந்து நான்கு மூன்று இரண்டு ஒன்று பூஜ்ஜியம்', expect: { phone: '9876543210' } },
  { tags: ['tamil'], speech: 'மாநிலம் தமிழ்நாடு, ஊர் திருவள்ளூர்', expect: { state: 'Tamil Nadu', city: ['Tiruvallur', 'Thiruvallur'] } },
  { tags: ['tamil'], speech: 'முகவரி 12 காந்தி தெரு, அண்ணா நகர், சென்னை', expect: { address: '12 Gandhi Street, Anna Nagar, Chennai' } },
  // Field-by-field mode
  { tags: ['field'], speech: 'Ramesh Kumar', target: 'full_name', expect: { full_name: 'Ramesh Kumar' } },
  { tags: ['field'], speech: 'ramesh at gmail dot com', target: 'email', expect: { email: 'ramesh@gmail.com' } },
  { tags: ['field'], speech: 'கேரளா', target: 'state', expect: { state: 'Kerala' } },
  { tags: ['field'], speech: 'aan', target: 'gender', expect: { gender: 'Male' } },

  // CAN registration, as Sarvam codemix writes it (Tamil words in Tamil script, numbers mostly as digits)
  { tags: ['can'], form: 'can', speech: 'Applicant name ஜெகன், father name ஜெகதீசன், gender male', expect: { applicant_name: ['Jagan', 'Jegan'], father_name: FATHER_JAGADEESAN, gender: 'Male' } },
  { tags: ['can'], form: 'can', speech: 'Name vandhu Jahan, அப்பா பெயர் Murugan', expect: { applicant_name: 'Jahan', father_name: 'Murugan' } },
  { tags: ['can'], form: 'can', speech: 'mobile number 95432 49890', expect: { mobile: '9543249890' } },
  { tags: ['can'], form: 'can', speech: 'ஆதார் நம்பர் 1234 5678 9012', expect: { aadhaar: '123456789012' } },
  { tags: ['can'], form: 'can', speech: 'பிறந்த தேதி 5.6.1998', expect: { dob: '1998-06-05' } },
  { tags: ['can'], form: 'can', speech: 'community MBC, religion Hindu', expect: { community: 'Most Backward Class (MBC)', religion: 'Hindu' } },
  { tags: ['can'], form: 'can', speech: 'நான் பிசி, கிறிஸ்டியன்', expect: { community: 'Backward Class (BC)', religion: 'Christian' } },
  { tags: ['can'], form: 'can', speech: 'district சேலம், taluk ஓமலூர், village Thulasampatti', expect: { district: 'Salem', taluk: ['Omalur', 'Omaloor'], village: ['Thulasampatti', 'Tulasampatti'] } },
  { tags: ['can'], form: 'can', speech: 'door number 12, street காந்தி தெரு, pincode 636 455', expect: { door_no: '12', street: ['Gandhi Street', 'Gandhi Theru'], pincode: '636455' } },
  { tags: ['can'], form: 'can', speech: 'Father Jagadheesan', expect: { father_name: FATHER_JAGADEESAN, applicant_name: null } },
  { tags: ['can'], form: 'can', speech: 'தந்தை ஜகதீசன்', expect: { father_name: FATHER_JAGADEESAN } },
  { tags: ['can'], form: 'can', speech: 'gender பெண், mobile ஒன்பது எட்டு நாலு மூணு இரண்டு ஒன்று ஆறு ஏழு எட்டு ஒன்பது', expect: { gender: 'Female', mobile: '9843216789' } },

  // Corrections that don't name the field, partial edits, spelled names
  {
    tags: ['corrections'],
    form: 'can',
    speech: 'illa, Jahan illa, Jagan',
    current: { applicant_name: 'Jahan' },
    recent: [{ speech: 'Name vandhu Jahan', set: { applicant_name: 'Jahan' } }],
    expect: { applicant_name: 'Jagan', father_name: null },
  },
  {
    tags: ['corrections'],
    form: 'can',
    speech: 'no, not Murugan, Murugesan',
    current: { applicant_name: 'Jagan', father_name: 'Murugan' },
    recent: [{ speech: 'father name Murugan', set: { father_name: 'Murugan' } }],
    expect: { father_name: 'Murugesan', applicant_name: null },
  },
  { tags: ['corrections'], form: 'can', speech: 'mobile number la kadaisi digit 5', current: { mobile: '9543249890' }, expect: { mobile: '9543249895' } },
  {
    tags: ['corrections'],
    form: 'can',
    speech: 'change it to 9876501234',
    current: { applicant_name: 'Jagan', mobile: '9543249890' },
    recent: [{ speech: 'mobile number 95432 49890', set: { mobile: '9543249890' } }],
    expect: { mobile: '9876501234', applicant_name: null },
  },
  { tags: ['corrections'], form: 'can', speech: 'applicant name spelling J A G A N', expect: { applicant_name: 'Jagan' } },
  { tags: ['corrections'], form: 'can', speech: 'pincode la 455 illa 445', current: { pincode: '636455' }, expect: { pincode: '636445' } },

  // Command-like speech (no spoken commands any more): nothing is filled, no value is invented
  { tags: ['commands'], form: 'can', speech: 'start over, ellam azhichidunga', expect: { applicant_name: null } },
  { tags: ['commands'], form: 'can', speech: 'send it to the computer', expect: {} },
  { tags: ['commands'], form: 'can', speech: 'innum enna baaki irukku?', expect: {} },
  { tags: ['commands'], form: 'can', speech: 'அனுப்பு', expect: {} },
  { tags: ['commands'], form: 'can', speech: 'Name Jagan, then send it', expect: { applicant_name: 'Jagan' } },
];
