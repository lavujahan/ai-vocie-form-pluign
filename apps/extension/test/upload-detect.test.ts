import { describe, expect, it } from 'vitest';
import { detect } from '../src/content/detector';

describe('upload fields', () => {
  it('finds visible and hidden-behind-a-button file inputs, with their rules text', () => {
    document.body.innerHTML = `
      <form>
        <label for="photo">Applicant photo *</label>
        <input id="photo" name="photo" type="file" accept=".jpg,.jpeg" required />
        <small>JPG only, below 50 KB</small>

        <div class="upload">
          <span>Community certificate</span>
          <button type="button" id="pick">Choose file</button>
          <input id="cert" name="cert" type="file" accept="application/pdf" style="display:none" />
          <p>PDF, max 1 MB</p>
          <button type="button" id="up">Upload</button>
        </div>

        <div class="dz">Drag and drop your signature here
          <input id="sign" name="sign" type="file" accept="image/*" hidden />
        </div>

        <input id="orphan" name="orphan" type="file" style="display:none" />
      </form>`;
    const { schema, registry } = detect(document);
    const files = schema.fields.filter((f) => f.field_type === 'file');
    expect(files.map((f) => f.field_key)).toEqual(['photo', 'cert', 'sign']); // `orphan`: nothing visible opens it
    const byKey = Object.fromEntries(files.map((f) => [f.field_key, f]));

    expect(byKey.photo).toMatchObject({ label: 'Applicant photo', accept: '.jpg,.jpeg', required: true });
    expect(byKey.photo.context).toContain('below 50 KB');
    expect(byKey.cert).toMatchObject({ label: 'Community certificate', accept: 'application/pdf' });
    expect(byKey.cert.context).toContain('max 1 MB');
    expect(byKey.sign.accept).toBe('image/*');

    // What opens each one, and the page's own Upload button (clicked by the user after filling).
    expect(registry.get('photo')!.file).toMatchObject({ trigger: document.getElementById('photo'), uploadButton: null });
    expect(registry.get('cert')!.file).toMatchObject({ trigger: document.getElementById('pick'), uploadButton: document.getElementById('up') });
    expect(registry.get('sign')!.file!.trigger).toBe(document.querySelector('.dz'));
  });
});
