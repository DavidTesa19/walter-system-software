import React from 'react';
import './Footer.css';

const Footer: React.FC = () => {
  return (
    <footer className="app-footer">
      <div className="footer-links">
        <a href="https://zoom.us/join" target="_blank" rel="noopener noreferrer" className="footer-link">Zoom</a>
        <a href="https://teams.microsoft.com/" target="_blank" rel="noopener noreferrer" className="footer-link">Teams</a>
        <a href="https://calendar.google.com/" target="_blank" rel="noopener noreferrer" className="footer-link">Calendar</a>
        <a href="https://meet.google.com/" target="_blank" rel="noopener noreferrer" className="footer-link">Meet</a>
        <a href="https://www.office.com/launch/excel" target="_blank" rel="noopener noreferrer" className="footer-link">Excel</a>
        <a href="https://mail.google.com/" target="_blank" rel="noopener noreferrer" className="footer-link">Gmail</a>
        <a href="https://trello.com/" target="_blank" rel="noopener noreferrer" className="footer-link">Trello</a>
        <a href="https://slack.com/signin" target="_blank" rel="noopener noreferrer" className="footer-link">Slack</a>
      </div>
    </footer>
  );
};

export default Footer;
