import './Author.css';
import { BBSContext } from './App';
import { parseNIP05Identifier } from './Nostr';
import { useContext, useEffect } from 'react';

let runningVerification = Promise.resolve();
const verifyCache = {};

// ドメイン認証のためのJSONを取得しキャッシュする。
// この関数が返すPromiseは必ず履行される。
function cacheJSON(url) {
  return new Promise(resolve => {
    if (verifyCache[url]) {
      resolve();
      return;
    }

    fetch(url, {method: 'GET', mode: 'cors', redirect: 'error' })
      .then(response => response.json())
      .then(j => {
        verifyCache[url] = j;
        resolve();
      })
      .catch(() => {
        verifyCache[url] = { names: {} };
        resolve();
      });
  }); 
}

// キャッシュ上のJSONを使いドメイン認証を行う
function verify(url, name, pubKey) {
  return new Promise((resolve, reject) => {
    console.log('verify', name, pubKey, verifyCache[url])
    const json = verifyCache[url];
    if (json.names && json.names[name] && json.names[name] === pubKey) {
      resolve();
      return;
    }
    reject();
  });
}

// 直列でドメイン認証する
function verifySequentially(url, name, pubKey) {
  runningVerification = new Promise((resolve, reject) => {
    runningVerification
      .catch(() => {}) // 直前の別の認証結果は無視して良い
      .finally(() => {
        cacheJSON(url)
          .then(() => verify(url, name, pubKey))
          .then(resolve)
          .catch(reject);
      })
  });

  return runningVerification;
}

function VerifiedDomain({ profile }) {
  if (profile.nip05Result !== 'ok') {
    return null;
  }

  const [localPart, domain] = parseNIP05Identifier(profile.nip05);

  return <b className="VerifiedDomain">{localPart === '_' ? domain : localPart + '@' + domain}</b>
}

function Author({ pubKey, atUnix }) {
  const { profiles, profilesDispatch } = useContext(BBSContext);
  const profile = profiles[pubKey];

  useEffect(() => {
    if (!profile || profile.nip05Result !== 'pending') {
      return;
    }

    const [localPart, domain] = parseNIP05Identifier(profiles[pubKey].nip05);
    const url = `https://${domain}/.well-known/nostr.json?name=${localPart}`;
    
    profilesDispatch({ type: 'CHECKING_DOMAIN_IDENTIFIER', pubKey });
    verifySequentially(url, localPart, pubKey)
      .then(() => profilesDispatch({type: 'SET_DOMAIN_IDENTIFIER_RESULT', pubKey, result: 'ok'}))
      .catch(() => profilesDispatch({type: 'SET_DOMAIN_IDENTIFIER_RESULT', pubKey, result: 'none'})); // 今のところ、失敗しても単に非表示にするだけ

  }, [profile]);

  if (!profile) {
    return null;
  }

  return (
    <span className="Author">
      <b className="Name">{profile ? (profile.display_name || profile.name) : 'Nostrich'}</b> <VerifiedDomain profile={profile} /> posted at {new Date(atUnix * 1000).toLocaleString()}
    </span>
  )
}

export default Author;