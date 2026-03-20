import React from 'react';
import './Card.css';

export interface CardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Card({ title, children, className = '' }: CardProps) {
  return (
    <article className={`aintel-card ${className}`.trim()}>
      {title && <header className="aintel-card__header">{title}</header>}
      <div className="aintel-card__body">{children}</div>
    </article>
  );
}
