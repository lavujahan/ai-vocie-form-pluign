/**
 * Few-shot examples for the Field Mapping Agent: Tamil, English and Tanglish speech → English values.
 * Keys refer to the illustrative form below; the agent must use the real form's keys at runtime.
 */
export const EXAMPLE_FORM = `full_name (Full name, text) · email (Email, email) · phone (Phone, tel) · dob (Date of birth, date) · gender (Gender, radio: Male | Female | Other) · marital (Marital status, select: Single | Married) · city (City, text) · address (Address, textarea) · name_ta (Name in Tamil, text, output_script=ta)`;

export const FEW_SHOT: { speech: string; current?: string; output: string }[] = [
  {
    speech: 'en peru Ramesh Kumar, email ramesh at gmail dot com, ooru Chennai',
    output:
      '{"values":[{"field_key":"full_name","value":"Ramesh Kumar","confidence":0.95,"source_phrase":"en peru Ramesh Kumar"},{"field_key":"email","value":"ramesh@gmail.com","confidence":0.95,"source_phrase":"ramesh at gmail dot com"},{"field_key":"city","value":"Chennai","confidence":0.95,"source_phrase":"ooru Chennai"}],"unmapped_speech":null,"missing_required":[]}',
  },
  {
    speech: 'என் பெயர் ரமேஷ் குமார். போன் நம்பர் ஒன்பது எட்டு ஏழு ஆறு ஐந்து நான்கு மூன்று இரண்டு ஒன்று பூஜ்ஜியம்',
    output:
      '{"values":[{"field_key":"full_name","value":"Ramesh Kumar","confidence":0.95,"source_phrase":"என் பெயர் ரமேஷ் குமார்"},{"field_key":"name_ta","value":"ரமேஷ் குமார்","confidence":0.9,"source_phrase":"ரமேஷ் குமார்"},{"field_key":"phone","value":"9876543210","confidence":0.9,"source_phrase":"ஒன்பது எட்டு ஏழு ஆறு ஐந்து நான்கு மூன்று இரண்டு ஒன்று பூஜ்ஜியம்"}],"unmapped_speech":null,"missing_required":[]}',
  },
  {
    speech: 'naan aan, kalyanam aachu, piranthathu 15 ஆம் தேதி மார்ச் 1990',
    output:
      '{"values":[{"field_key":"gender","value":"Male","confidence":0.9,"source_phrase":"naan aan"},{"field_key":"marital","value":"Married","confidence":0.9,"source_phrase":"kalyanam aachu"},{"field_key":"dob","value":"1990-03-15","confidence":0.95,"source_phrase":"15 ஆம் தேதி மார்ச் 1990"}],"unmapped_speech":null,"missing_required":[]}',
  },
  {
    speech: 'phone number double nine eight four triple zero one two three',
    output:
      '{"values":[{"field_key":"phone","value":"9984000123","confidence":0.9,"source_phrase":"double nine eight four triple zero one two three"}],"unmapped_speech":null,"missing_required":[]}',
  },
  {
    speech: 'change the email to ramesh dot k at yahoo dot com, and clear the city',
    current: 'email = "ramesh@gmail.com", city = "Chennai"',
    output:
      '{"values":[{"field_key":"email","value":"ramesh.k@yahoo.com","confidence":0.95,"source_phrase":"ramesh dot k at yahoo dot com"},{"field_key":"city","value":"","confidence":0.95,"source_phrase":"clear the city"}],"unmapped_speech":null,"missing_required":[]}',
  },
  {
    speech: 'address 12 காந்தி தெரு, அண்ணா நகர், சென்னை. weather nalla irukku',
    output:
      '{"values":[{"field_key":"address","value":"12 Gandhi Street, Anna Nagar, Chennai","confidence":0.85,"source_phrase":"12 காந்தி தெரு, அண்ணா நகர், சென்னை"}],"unmapped_speech":"weather nalla irukku","missing_required":[]}',
  },
];

export function renderFewShot(): string {
  return FEW_SHOT.map(
    (e, i) =>
      `Example ${i + 1}\nSpeech: ${e.speech}${e.current ? `\nCurrent values: ${e.current}` : ''}\nOutput: ${e.output}`,
  ).join('\n\n');
}
