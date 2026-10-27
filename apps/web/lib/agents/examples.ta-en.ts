/**
 * Few-shot examples for the Field Mapping Agent: Tamil, English and Tanglish speech → English values.
 * Keys refer to the illustrative form below; the agent must use the real form's keys at runtime.
 */
export const EXAMPLE_FORM = `full_name (Full name, text) · father_name (Father name, text) · email (Email, email) · phone (Phone, tel) · dob (Date of birth, date) · gender (Gender, radio: Male | Female | Other) · marital (Marital status, select: Single | Married) · city (City, text) · address (Address, textarea) · name_ta (Name in Tamil, text, output_script=ta)`;

export const FEW_SHOT: { speech: string; current?: string; recent?: string; output: string }[] = [
  {
    speech: 'en peru Ramesh Kumar, email ramesh at gmail dot com, ooru Chennai',
    output:
      '{"values":[{"field_key":"full_name","value":"Ramesh Kumar","confidence":0.95,"source_phrase":null},{"field_key":"email","value":"ramesh@gmail.com","confidence":0.95,"source_phrase":"ramesh at gmail dot com"},{"field_key":"city","value":"Chennai","confidence":0.95,"source_phrase":null}]}',
  },
  {
    speech: 'என் பெயர் ரமேஷ் குமார். போன் நம்பர் ஒன்பது எட்டு ஏழு ஆறு ஐந்து நான்கு மூன்று இரண்டு ஒன்று பூஜ்ஜியம்',
    output:
      '{"values":[{"field_key":"full_name","value":"Ramesh Kumar","confidence":0.95,"source_phrase":"ரமேஷ் குமார்"},{"field_key":"name_ta","value":"ரமேஷ் குமார்","confidence":0.9,"source_phrase":null},{"field_key":"phone","value":"9876543210","confidence":0.9,"source_phrase":"ஒன்பது எட்டு ஏழு ஆறு ஐந்து நான்கு மூன்று இரண்டு ஒன்று பூஜ்ஜியம்","number_parts":[{"heard":"ஒன்பது","digits":"9"},{"heard":"எட்டு","digits":"8"},{"heard":"ஏழு","digits":"7"},{"heard":"ஆறு","digits":"6"},{"heard":"ஐந்து","digits":"5"},{"heard":"நான்கு","digits":"4"},{"heard":"மூன்று","digits":"3"},{"heard":"இரண்டு","digits":"2"},{"heard":"ஒன்று","digits":"1"},{"heard":"பூஜ்ஜியம்","digits":"0"}]}]}',
  },
  {
    speech: 'naan aan, kalyanam aachu, piranthathu 15 ஆம் தேதி மார்ச் 1990',
    output:
      '{"values":[{"field_key":"gender","value":"Male","confidence":0.9,"source_phrase":"aan"},{"field_key":"marital","value":"Married","confidence":0.9,"source_phrase":"kalyanam aachu"},{"field_key":"dob","value":"1990-03-15","confidence":0.95,"source_phrase":"15 ஆம் தேதி மார்ச் 1990"}]}',
  },
  {
    speech: 'Name vandhu Jahan, gender male, ஃபாதர்ஸ் நேம் ஜகதீசன், marital status single nu podunga',
    output:
      '{"values":[{"field_key":"full_name","value":"Jahan","confidence":0.9,"source_phrase":null},{"field_key":"gender","value":"Male","confidence":0.95,"source_phrase":null},{"field_key":"father_name","value":"Jagadheesan","confidence":0.9,"source_phrase":"ஜகதீசன்"},{"field_key":"marital","value":"Single","confidence":0.9,"source_phrase":null}]}',
  },
  {
    speech: 'phone number double nine eight four triple zero one two three',
    output:
      '{"values":[{"field_key":"phone","value":"9984000123","confidence":0.9,"source_phrase":"double nine eight four triple zero one two three","number_parts":[{"heard":"double nine","digits":"99"},{"heard":"eight","digits":"8"},{"heard":"four","digits":"4"},{"heard":"triple zero","digits":"000"},{"heard":"one","digits":"1"},{"heard":"two","digits":"2"},{"heard":"three","digits":"3"}]}]}',
  },
  {
    speech: 'change the email to ramesh dot k at yahoo dot com, and clear the city',
    current: 'email = "ramesh@gmail.com", city = "Chennai"',
    output:
      '{"values":[{"field_key":"email","value":"ramesh.k@yahoo.com","confidence":0.95,"source_phrase":"ramesh dot k at yahoo dot com"},{"field_key":"city","value":"","confidence":0.95,"source_phrase":null}]}',
  },
  {
    speech: 'address 12 காந்தி தெரு, அண்ணா நகர், சென்னை. weather nalla irukku',
    output:
      '{"values":[{"field_key":"address","value":"12 Gandhi Street, Anna Nagar, Chennai","confidence":0.85,"source_phrase":"12 காந்தி தெரு, அண்ணா நகர், சென்னை"}]}',
  },
  // A correction that doesn't name the field: the recent speech says which field "Jahan" was.
  {
    speech: 'illa, Jahan illa, Jagan',
    current: 'full_name = "Jahan"',
    recent: '"Name vandhu Jahan" → full_name="Jahan"',
    output: '{"values":[{"field_key":"full_name","value":"Jagan","confidence":0.9,"source_phrase":null}]}',
  },
  // A partial edit: change one digit of the current value, keep the rest exactly.
  {
    speech: 'phone number la kadaisi digit 5',
    current: 'phone = "9876543210"',
    output: '{"values":[{"field_key":"phone","value":"9876543215","confidence":0.85,"source_phrase":"kadaisi digit 5"}]}',
  },
  // Spelled-out letters become one word.
  {
    speech: 'father name spelling J A G A D H E E S A N',
    output: '{"values":[{"field_key":"father_name","value":"Jagadheesan","confidence":0.95,"source_phrase":"J A G A D H E E S A N"}]}',
  },
  // Not about any field: nothing to fill (never invent a value).
  {
    speech: 'ellam azhichidunga, start over',
    output: '{"values":[]}',
  },
];

// number_parts is omitted above where it is null, to keep the examples short.
export function renderFewShot(): string {
  return FEW_SHOT.map(
    (e, i) =>
      `Example ${i + 1}\nSpeech: ${e.speech}${e.current ? `\nCurrent values: ${e.current}` : ''}${
        e.recent ? `\nRecent speech: ${e.recent}` : ''
      }\nOutput: ${e.output}`,
  ).join('\n\n');
}
