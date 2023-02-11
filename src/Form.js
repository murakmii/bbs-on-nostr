import './Form.css';
import Button from './Button';
import { NostrContext } from './App';
import { enableNIP07 } from './Nostr';
import { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';

function Form({ forThread, onSubmit }) {
  const [validInput, setValidInput] = useState(false);
  const {pubKey, setPubKey} = useContext(NostrContext);

  // 公開鍵の取得の可否でBBSでNIP-07を使用するかどうかを決定する
  // 拒否された場合は拡張未導入と同様の振る舞いとする(秘密鍵手入力)
  useEffect(() => {
    if (enableNIP07() && pubKey === null) {
      window.nostr.getPublicKey()
        .then(setPubKey)
        .catch(() => setPubKey(prev => prev === null ? '' : prev));
    }
  }, []);

  const validate = () => {
    const subject = forThread && document.form.subject.value;
    const content = document.form.content.value;
    const privkey = document.form.privkey ? document.form.privkey.value : '';
    const useNIP07 = enableNIP07() && pubKey.length > 0;
    
    return (
      (!forThread || (subject.length > 0 && subject.length < 100 && !subject.includes('nsec'))) &&
      content.length > 0 && content.length < 1000 && !content.includes('nsec') &&
      document.form.tos.checked &&
      (useNIP07 || (privkey.length > 0))
    );
  };

  const submit = (e) => {
    e.preventDefault();

    onSubmit({
      subject: forThread && document.form.subject.value,
      content: document.form.content.value,
      encodedPrivKey: document.form.privkey && document.form.privkey.value,
      useNIP07: enableNIP07() && pubKey.length > 0,
    });
  };

  let keyForm = null;
  if (!enableNIP07() || pubKey === '') {
    keyForm = (
      <>
        <th>秘密鍵</th>
        <td>
          <input type="text" name="privkey" placeholder="nsecXXX..." onChange={() => setValidInput(validate())} />
          <p className="PrivKeyWarn">
            <a href="https://github.com/nostr-protocol/nips/blob/master/07.md#implementation" target="_blank" rel="noreferrer">拡張機能</a>を導入することで秘密鍵の入力を避け、
            より安全にBBSやその他Nostr関連サービスを利用することができるようになります！この機会に導入してみませんか？
          </p>
        </td>
      </>
    );
  } else if (enableNIP07()) {
    if (pubKey === null) {
      keyForm = (
        <>
          <td></td>
          <td className="checkingNIP07">NIP-07 パーミッション確認中...</td>
        </>
      );
    } else {
      keyForm = (
        <>
          <td></td>
          <td className="useNIP07">
            あなたの認証情報はNIP-07で保護されています！<br />
            ✅ <span>{nip19.npubEncode(pubKey)}</span>
          </td>
        </>
      );
    }
  }

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
            {keyForm}
          </tr>
          <tr>
            <td colSpan="2">
              <input type="checkbox" id="ReadTOS" name="tos" onChange={() => setValidInput(validate())} />
              <label htmlFor="ReadTOS">わたしは<Link to="/tos">利用規約</Link>に同意します</label>
              <Button disabled={!validInput} onClick={submit}>{forThread ? 'スレッドを作成' : '返信'}</Button>
            </td>
          </tr>
        </tbody>
      </table>
    </form>
  )
}

export default Form;