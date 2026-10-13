import type { ButtonHTMLAttributes } from 'react';
export function Button({ variant = '', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'quiet' | 'icon' | '' }) {
  return <button type="button" className={`button ${variant} ${className}`} {...props}/>;
}
