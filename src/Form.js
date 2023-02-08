import './Form.css';
import Button from './Button';
import { useState } from 'react';

function Form({ forThread, onSubmit }) {
  const [validInput, setValidInput] = useState(false);
  const [useNIP07, setUseNIP07] = useState(false);

  // NIP-07(https://github.com/nostr-protocol/nips/blob/master/07.md)対応状況を確認し、
  // 可能であれば「NIP-07対応機能で署名する」チェックボックスを有効にする。
  // といっても単にwindowオブジェクトに所定のプロパティがあるかどうかを確認するだけ。
  const enableNIP07 = window.nostr && window.nostr.signEvent;

  const validate = () => {
    const subject = forThread && document.form.subject.value;
    const content = document.form.content.value;
    const privkey = document.form.privkey.value;
    
    return (
      (!forThread || (subject.length > 0 && subject.length < 100 && !subject.includes('nsec'))) &&
      content.length > 0 && content.length < 1000 && !content.includes('nsec') &&
      (document.form.useNIP07.checked || privkey.length > 0) &&
      document.form.tos.checked
    );
  };

  const submit = (e) => {
    e.preventDefault();

    onSubmit({
      subject: forThread && document.form.subject.value,
      content: document.form.content.value,
      encodedPrivKey: document.form.privkey.value,
      useNIP07: document.form.useNIP07.checked,
    });
  };

  const onChangeUseNIP07 = (e) => {
    setUseNIP07(e.target.checked);
    if (e.target.checked) {
      document.form.privkey.value = '';
    }
    setValidInput(validate());
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
              <input type="text" name="privkey" placeholder="nsecXXX..." onChange={() => setValidInput(validate())} disabled={useNIP07} /><br />
              <input type="checkbox" disabled={!enableNIP07} name="useNIP07" id="UseNIP07" onChange={onChangeUseNIP07} />
              <label htmlFor="UseNIP07">{'NIP-07対応機能で署名する' + (enableNIP07 ? '' : ' - このブラウザには拡張機能が導入されていません')}</label>
            </td>
          </tr>
          <tr>
            <td colSpan="2">
              <input type="checkbox" id="ReadTOS" name="tos" onChange={() => setValidInput(validate())} />
              <label htmlFor="ReadTOS"><a href="/tos" target="_blank" rel="noreferrer">利用規約</a>に同意します</label>
              <Button disabled={!validInput} onClick={submit}>{forThread ? 'スレッドを作成' : '返信'}</Button>
            </td>
          </tr>
        </tbody>
      </table>
    </form>
  )
}

export default Form;