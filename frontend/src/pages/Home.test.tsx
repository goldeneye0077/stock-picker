import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Home from './Home';

describe('Home', () => {
  it('渲染首页关键模块并能通过 CTA 导航', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/home']}>
        <Routes>
          <Route path="/home" element={<Home />} />
          <Route path="/smart-selection" element={<div>smart-selection</div>} />
          <Route path="*" element={<div>not-found</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText('今日入选')).toBeInTheDocument();
    expect(screen.getByText('昨日策略胜率')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '配置我的策略' }));
    expect(screen.getByText('smart-selection')).toBeInTheDocument();
  });
});
