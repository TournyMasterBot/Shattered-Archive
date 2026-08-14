import { render } from '@testing-library/react';

import ParticleField from './ParticleField.js';

describe('ParticleField', () => {
  it('renders a canvas without throwing, even where 2D context is unavailable (jsdom)', () => {
    const { container } = render(<ParticleField />);
    expect(container.querySelector('canvas.ss-particle-field')).not.toBeNull();
  });
});
