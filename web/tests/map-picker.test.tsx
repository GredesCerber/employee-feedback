import { useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MapPicker, type LocationPoint } from '../src/features/MapPicker';
afterEach(cleanup);
function Example() {
  const [point, setPoint] = useState<LocationPoint>(); const [valid, setValid] = useState(true);
  return <><MapPicker value={point} onChange={setPoint} onValidityChange={setValid} /><output>{point ? JSON.stringify(point) : 'none'}</output><button disabled={!valid}>Submit</button></>;
}
describe('MapPicker', () => {
  it('applies coordinates without a second click and blocks submission for incomplete or invalid drafts', () => {
    render(<Example />); expect(screen.getByText(/Карта недоступна/)).toBeTruthy();
    const submit = screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement;
    const lat = screen.getByLabelText('Широта'), lng = screen.getByLabelText('Долгота');
    fireEvent.change(lat, { target: { value: '-54.5' } }); expect(submit.disabled).toBe(true);
    fireEvent.change(lng, { target: { value: '73.37' } }); expect(submit.disabled).toBe(false);
    expect(screen.getByText('{"latitude":-54.5,"longitude":73.37}')).toBeTruthy();
    fireEvent.change(lat, { target: { value: '91' } }); expect(submit.disabled).toBe(true); expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('{"latitude":-54.5,"longitude":73.37}')).toBeTruthy();
    fireEvent.change(lat, { target: { value: '-55.5' } }); expect(submit.disabled).toBe(false); expect(screen.getByText('{"latitude":-55.5,"longitude":73.37}')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Удалить точку' })); expect(screen.getByText('none')).toBeTruthy(); expect(submit.disabled).toBe(false);
  });
  it('shows a read-only point and OpenStreetMap link', () => { render(<MapPicker readOnly value={{ latitude: 54.99, longitude: 73.37 }} />); expect(screen.getByText(/54.99/)).toBeTruthy(); expect(screen.getByRole('link').getAttribute('href')).toContain('mlat=54.99&mlon=73.37'); expect(screen.queryByRole('button', { name: 'Удалить точку' })).toBeNull(); });
});
