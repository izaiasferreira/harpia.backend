const APP_STATES = [
  { value: 'pi', abbreviation: 'PI', label: 'Piauí' },
  { value: 'ma', abbreviation: 'MA', label: 'Maranhão' }
];

const VALID_STATE_VALUES = APP_STATES.map(s => s.value);
const VALID_STATE_VALUES_ALL = [...VALID_STATE_VALUES, ...APP_STATES.map(s => s.abbreviation)];

module.exports = { APP_STATES, VALID_STATE_VALUES, VALID_STATE_VALUES_ALL };
