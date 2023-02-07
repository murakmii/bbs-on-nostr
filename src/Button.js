import './Button.css';

function Button({ children, disabled, onClick }) {
  return <button className="Button" disabled={disabled} onClick={onClick}>{children}</button>
}

export default Button;
