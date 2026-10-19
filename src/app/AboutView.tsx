import { buildModuleUrl } from 'cesium';
import { DATA_CREDITS, PACKAGE_CREDITS } from './credits';
import styles from './SettingsView.module.css';

/**
 * About and credits: the client's version, the map imagery's sources, and every open-source
 * package with its version and license. Cesium's logo credit lives here instead of over the map.
 */
export function AboutView() {
  return (
    <div className={styles.view}>
      <div className={styles.card}>
        <h2>About ForeSignal Client</h2>
        <dl>
          <dt>Version</dt>
          <dd data-testid="app-version">{__APP_VERSION__}</dd>
        </dl>

        <h3>Map</h3>
        <p>
          <a href="https://cesium.com/" target="_blank" rel="noreferrer">
            <img src={buildModuleUrl('Assets/Images/cesium_credit.png')} alt="Cesium" height={22} />
          </a>
        </p>
        <p>
          The map is drawn with CesiumJS {__APP_DEPENDENCIES__.cesium}, licensed under the Apache
          License 2.0.
        </p>

        <h3>Imagery</h3>
        <ul data-testid="data-credits">
          {DATA_CREDITS.map((credit) => (
            <li key={credit.name}>
              <strong>{credit.name}</strong>, {credit.provider}. {credit.use}.{' '}
              <a href={credit.source} target="_blank" rel="noreferrer">
                Source
              </a>
            </li>
          ))}
        </ul>

        <h3>Open-source software</h3>
        <table data-testid="package-credits">
          <thead>
            <tr>
              <th>Package</th>
              <th>Version</th>
              <th>License</th>
              <th>Used for</th>
            </tr>
          </thead>
          <tbody>
            {PACKAGE_CREDITS.map((pkg) => (
              <tr key={pkg.name}>
                <td>{pkg.name}</td>
                <td>{__APP_DEPENDENCIES__[pkg.name]}</td>
                <td>{pkg.license}</td>
                <td>{pkg.use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
