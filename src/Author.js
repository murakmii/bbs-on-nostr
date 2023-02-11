import './Author.css';

function Author({ profile, atUnix }) {
  if (!profile) {
    return null;
  }

  const name = profile.display_name || profile.name;

  return (
    <span className="Author">
      <b className="Name">{name}</b> posted at {new Date(atUnix * 1000).toLocaleString()}
    </span>
  )
}

export default Author;