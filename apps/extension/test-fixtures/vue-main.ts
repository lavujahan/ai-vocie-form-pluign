import { createApp, reactive } from 'vue';

createApp({
  setup() {
    const form = reactive({
      full_name: '',
      email: '',
      phone: '',
      dob: '',
      state: '',
      gender: '',
      contact: [] as string[],
      terms: false,
      address: '',
    });
    return { form };
  },
  template: `
    <form @submit.prevent>
      <h2>Customer onboarding</h2>
      <label for="full_name">Full name *</label>
      <input id="full_name" name="full_name" v-model="form.full_name" required />
      <label for="email">Email</label>
      <input id="email" name="email" type="email" v-model="form.email" />
      <label for="phone">Mobile number</label>
      <input id="phone" name="phone" type="tel" v-model="form.phone" />
      <label for="dob">Date of birth</label>
      <input id="dob" name="dob" type="date" v-model="form.dob" />
      <label for="state">State</label>
      <select id="state" name="state" v-model="form.state">
        <option value="">Select state</option>
        <option value="TN">Tamil Nadu</option>
        <option value="KL">Kerala</option>
      </select>
      <fieldset>
        <legend>Gender</legend>
        <label><input type="radio" name="gender" value="m" v-model="form.gender" /> Male</label>
        <label><input type="radio" name="gender" value="f" v-model="form.gender" /> Female</label>
      </fieldset>
      <fieldset>
        <legend>Contact me by</legend>
        <label><input type="checkbox" name="contact" value="sms" v-model="form.contact" /> SMS</label>
        <label><input type="checkbox" name="contact" value="email" v-model="form.contact" /> Email</label>
      </fieldset>
      <label><input type="checkbox" id="terms" name="terms" v-model="form.terms" /> I agree to the terms</label>
      <label for="address">Address</label>
      <textarea id="address" name="address" v-model="form.address"></textarea>
      <pre id="state-echo" data-vff-ignore>{{ JSON.stringify(form) }}</pre>
    </form>`,
}).mount('#app');
