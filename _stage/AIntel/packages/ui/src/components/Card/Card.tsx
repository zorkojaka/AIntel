import React from 'react';
import './Card.css';

export interface CardProps {
  title?: string;
  children: React.ReactNode;
}

export function Card({ title, children }: CardProps) {
  return (
    <article className="aintel-card">
      {title && <header className="aintel-card__header">{title}</header>}
      <div className="aintel-card__body">{children}</div>
    </article>
  );
}
