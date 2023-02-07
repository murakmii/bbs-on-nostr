import './Form.css';
import Button from './Button';
import { useState } from 'react';

function Form({ forThread, onSubmit }) {
  const [validInput, setValidInput] = useState(false);

  const validate = () => {
    const subject = forThread && document.form.subject.value;
    const content = document.form.content.value;
    const privkey = document.form.privkey.value;

    return (
      (!forThread || (subject.length > 0 && subject.length < 100 && !subject.includes('nsec'))) &&
      content.length > 0 && content.length < 1000 && !content.includes('nsec') &&
      privkey.length > 0 &&
      document.form.tos.checked
    );
  };

  const submit = (e) => {
    e.preventDefault();

    onSubmit({
      subject: forThread && document.form.subject.value,
      content: document.form.content.value,
      privkey: document.form.privkey.value,
    });
  };

  return (
    <form id="Form" name="form" onSubmit={() => false}>
      <table>
        <tbody>
          {forThread && (
            <tr>
              <th>タイトル</th>
              <td><input type="text" name="subject" onChange={() => setValidInput(validate())} /></td>
            </tr>
          )}
          <tr>
            <th>{forThread ? '本文' : '返信内容'}</th>
            <td>
              <textarea 
                name="content" 
                placeholder="安全のため、'nsec'という文字を含めることはできません"
                onChange={() => setValidInput(validate())}
              />
            </td>
          </tr>
          <tr>
            <th>秘密鍵</th>
            <td>
              <input type="text" name="privkey" placeholder="nsecXXX..." onChange={() => setValidInput(validate())} /><br />
            </td>
          </tr>
          <tr>
            <td colSpan="2">
              <input type="checkbox" id="ReadTOS" name="tos" onChange={() => setValidInput(validate())} />
              <label htmlFor="ReadTOS"><a href="/tos" target="_blank" rel="noopener">利用規約</a>に同意します</label>
              <Button disabled={!validInput} onClick={submit}>{forThread ? 'スレッドを作成' : '返信'}</Button>
            </td>
          </tr>
        </tbody>
      </table>
    </form>
  )
}

export default Form;