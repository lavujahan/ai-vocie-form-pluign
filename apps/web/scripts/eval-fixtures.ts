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

export type EvalCase = {
  speech: string;
  target?: string;
  current?: Record<string, string>;
  /** Expected values; `null` means the field must NOT be returned. Fields not listed are not checked. */
  expect: Record<string, string | null>;
};

export const EVAL_CASES: EvalCase[] = [
  // English
  { speech: 'My name is Ramesh Kumar, email ramesh@gmail.com, phone 9876543210', expect: { full_name: 'Ramesh Kumar', email: 'ramesh@gmail.com', phone: '9876543210' } },
  { speech: 'Email is priya underscore s at yahoo dot co dot in', expect: { email: 'priya_s@yahoo.co.in', full_name: null } },
  { speech: 'phone number double nine eight four triple zero one two three', expect: { phone: '9984000123' } },
  { speech: 'I was born on 15th March 1990', expect: { dob: '1990-03-15' } },
  { speech: 'I am female and single', expect: { gender: 'Female', marital: 'Single' } },
  { speech: 'City Coimbatore, state Tamil Nadu, pincode six four one zero zero one', expect: { city: 'Coimbatore', state: 'Tamil Nadu', pincode: '641001' } },
  { speech: 'GST number is 33 ABCDE 1234 F 1 Z 5', expect: { gst: '33ABCDE1234F1Z5' } },
  { speech: 'Yes, subscribe me to the newsletter', expect: { newsletter: 'true' } },
  { speech: "Don't subscribe me to the newsletter", expect: { newsletter: 'false' } },
  { speech: 'Change the phone to 9123456780', current: { phone: '9876543210' }, expect: { phone: '9123456780', email: null } },
  { speech: 'Clear the city', current: { city: 'Chennai' }, expect: { city: '' } },
  { speech: 'The weather is nice today', expect: { full_name: null, city: null } },
  // Tanglish
  { speech: 'en peru Ramesh Kumar, ooru Chennai', expect: { full_name: 'Ramesh Kumar', city: 'Chennai' } },
  { speech: 'naan aan, kalyanam aachu', expect: { gender: 'Male', marital: 'Married' } },
  { speech: 'en email ramesh at gmail dot com, phone number onbadhu ettu ezhu aaru anju naalu moonu rendu onnu poojyam', expect: { email: 'ramesh@gmail.com', phone: '9876543210' } },
  { speech: 'naan Madurai la irukken, state Tamil Nadu', expect: { city: 'Madurai', state: 'Tamil Nadu' } },
  { speech: 'kalyanam aagala, naan penn', expect: { marital: 'Single', gender: 'Female' } },
  { speech: 'pirandha naal 2 June 1985', expect: { dob: '1985-06-02' } },
  { speech: 'newsletter venam', expect: { newsletter: 'false' } },
  { speech: 'phone number maathunga, puthu number 9000012345', current: { phone: '9876543210' }, expect: { phone: '9000012345' } },
  // Tamil script
  { speech: 'என் பெயர் ரமேஷ் குமார்', expect: { full_name: 'Ramesh Kumar', name_ta: 'ரமேஷ் குமார்' } },
  { speech: 'நான் சென்னையில் வசிக்கிறேன்', expect: { city: 'Chennai' } },
  { speech: 'என் பிறந்த தேதி 15 ஆம் தேதி மார்ச் 1990', expect: { dob: '1990-03-15' } },
  { speech: 'நான் ஆண், திருமணமானவர்', expect: { gender: 'Male', marital: 'Married' } },
  { speech: 'போன் நம்பர் ஒன்பது எட்டு ஏழு ஆறு ஐந்து நான்கு மூன்று இரண்டு ஒன்று பூஜ்ஜியம்', expect: { phone: '9876543210' } },
  { speech: 'மாநிலம் தமிழ்நாடு, ஊர் திருவள்ளூர்', expect: { state: 'Tamil Nadu', city: 'Tiruvallur' } },
  { speech: 'முகவரி 12 காந்தி தெரு, அண்ணா நகர், சென்னை', expect: { address: '12 Gandhi Street, Anna Nagar, Chennai' } },
  // Field-by-field mode
  { speech: 'Ramesh Kumar', target: 'full_name', expect: { full_name: 'Ramesh Kumar' } },
  { speech: 'ramesh at gmail dot com', target: 'email', expect: { email: 'ramesh@gmail.com' } },
  { speech: 'கேரளா', target: 'state', expect: { state: 'Kerala' } },
  { speech: 'aan', target: 'gender', expect: { gender: 'Male' } },
];
