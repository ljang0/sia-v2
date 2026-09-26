import logo from '../assets/sia-logo.png';
import './sia-logo.css';

/** The supplied logo is shared with the phone's Home Screen icon. */
export function SiaLogo() {
  return <img className="sia-logo" src={logo} alt="" draggable={false} />;
}
