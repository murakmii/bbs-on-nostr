const linkMatcher = /https?:\/\/[\w!\?/\+\-_~=;\.,\*&@#\$%\(\)'\[\]]+/g;
const lineBreakMatcher = /\r?\n/;

// 改行とURLのリンク化に対応したp
function ReadableText({children}) {
  const match = (children.match(linkMatcher) || [])
  const other = children.split(linkMatcher);
  const result = [];

  let key = 1;
  for (let i = 0; i < other.length; i++) {
    const lines = other[i].split(lineBreakMatcher);
    for (let j = 0; j < lines.length; j++) {
      result.push(lines[j]);
      if (j != lines.length - 1) {
        result.push(<br key={key++} />);
      }
    }

    if (match[i]) {
      result.push(<a key={key++} href={match[i]} target="_blank" rel="noreferrer">{match[i]}</a>)
    }
  }

  return (
    <p className="ReadableText">{result}</p>
  );
}

export default ReadableText;