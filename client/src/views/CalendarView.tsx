import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, momentLocalizer, Views, type View } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import moment from 'moment';
import { useGoogleLogin } from '@react-oauth/google';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';
import './CalendarView.css';

// Setup localizer
const localizer = momentLocalizer(moment);
const DnDCalendar = withDragAndDrop(Calendar);

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  description?: string;
  location?: string;
  resource?: any; // Store original Google event object
}

const CustomToolbar = (toolbar: any) => {
  const goToBack = () => {
    toolbar.onNavigate(Navigate.PREVIOUS);
  };

  const goToNext = () => {
    toolbar.onNavigate(Navigate.NEXT);
  };

  const goToCurrent = () => {
    toolbar.onNavigate(Navigate.TODAY);
  };

  const label = () => {
    const date = moment(toolbar.date);
    return (
      <span className="rbc-toolbar-label-text">
        {date.format('MMMM YYYY')}
      </span>
    );
  };

  return (
    <div className="rbc-toolbar">
      <div className="rbc-toolbar-group left">
        <button className="rbc-btn-today" onClick={goToCurrent}>
          Today
        </button>
        <div className="rbc-btn-group-nav">
          <button type="button" onClick={goToBack} aria-label="Previous">
            <svg width="20" height="20" viewBox="0 0 24 24" focusable="false" fill="currentColor">
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"></path>
            </svg>
          </button>
          <button type="button" onClick={goToNext} aria-label="Next">
            <svg width="20" height="20" viewBox="0 0 24 24" focusable="false" fill="currentColor">
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"></path>
            </svg>
          </button>
        </div>
        <span className="rbc-toolbar-label">{label()}</span>
      </div>
      
      <div className="rbc-toolbar-group right">
        <div className="rbc-view-selector">
           <select 
            value={toolbar.view} 
            onChange={(e) => toolbar.onView(e.target.value)}
            className="google-view-select"
           >
             <option value="month">Month</option>
             <option value="week">Week</option>
             <option value="day">Day</option>
             <option value="agenda">Schedule</option>
           </select>
        </div>
      </div>
    </div>
  );
};

const CalendarView: React.FC = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [accessToken, setAccessToken] = useState<string | null>(localStorage.getItem('google_access_token'));
  const [showModal, setShowModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ start: Date, end: Date } | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<View>(Views.WEEK);
  const [date, setDate] = useState(new Date());

  // Google Login Hook
  const login = useGoogleLogin({
    onSuccess: (codeResponse) => {
      setAccessToken(codeResponse.access_token);
      localStorage.setItem('google_access_token', codeResponse.access_token);
    },
    scope: 'https://www.googleapis.com/auth/calendar',
    onError: (error) => console.log('Login Failed:', error)
  });

  const logout = () => {
    setAccessToken(null);
    localStorage.removeItem('google_access_token');
    setEvents([]);
  };

  // Fetch Events
  const fetchEvents = useCallback(async () => {
    if (!accessToken) return;
    
    setIsLoading(true);
    try {
      // Fetch events based on current view
      let startRange = moment(date).startOf('month').subtract(1, 'month');
      let endRange = moment(date).endOf('month').add(1, 'month');

      if (view === Views.WEEK || view === Views.DAY) {
        startRange = moment(date).startOf('week').subtract(1, 'week');
        endRange = moment(date).endOf('week').add(1, 'week');
      }

      const timeMin = startRange.toISOString();
      const timeMax = endRange.toISOString();
      
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.status === 401) {
        logout();
        return;
      }

      const data = await response.json();
      
      if (data.items) {
        const formattedEvents = data.items.map((item: any) => ({
          id: item.id,
          title: item.summary || '(No Title)',
          start: new Date(item.start.dateTime || item.start.date),
          end: new Date(item.end.dateTime || item.end.date),
          allDay: !item.start.dateTime,
          description: item.description,
          location: item.location,
          resource: item
        }));
        setEvents(formattedEvents);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, date, view]);

  useEffect(() => {
    if (accessToken) {
      fetchEvents();
    }
  }, [accessToken, fetchEvents]);

  // Create Event
  const handleCreateEvent = async () => {
    if (!accessToken || !selectedSlot || !eventTitle) return;

    try {
      const event = {
        summary: eventTitle,
        description: eventDescription,
        start: {
          dateTime: selectedSlot.start.toISOString(),
        },
        end: {
          dateTime: selectedSlot.end.toISOString(),
        },
      };

      await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      });

      closeModal();
      fetchEvents();
    } catch (error) {
      console.error('Error creating event:', error);
    }
  };

  // Update Event (Drag & Drop / Resize)
  const handleUpdateEvent = async ({ event, start, end }: any) => {
    if (!accessToken) return;

    // Optimistic update
    const updatedEvents = events.map(e => 
      e.id === event.id ? { ...e, start, end } : e
    );
    setEvents(updatedEvents);

    try {
      const googleEvent = {
        start: {
          dateTime: start.toISOString(),
        },
        end: {
          dateTime: end.toISOString(),
        },
      };

      await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${event.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(googleEvent),
      });
    } catch (error) {
      console.error('Error updating event:', error);
      fetchEvents(); // Revert on error
    }
  };

  // Delete Event
  const handleDeleteEvent = async () => {
    if (!accessToken || !selectedEvent) return;

    if (!window.confirm(`Are you sure you want to delete "${selectedEvent.title}"?`)) return;

    try {
      await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${selectedEvent.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      closeModal();
      fetchEvents();
    } catch (error) {
      console.error('Error deleting event:', error);
    }
  };

  const onEventDrop = ({ event, start, end }: any) => {
    handleUpdateEvent({ event, start, end });
  };

  const onEventResize = ({ event, start, end }: any) => {
    handleUpdateEvent({ event, start, end });
  };

  const handleSelectSlot = (slotInfo: { start: Date, end: Date }) => {
    setSelectedSlot(slotInfo);
    setSelectedEvent(null);
    setEventTitle('');
    setEventDescription('');
    setShowModal(true);
  };

  const handleSelectEvent = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setSelectedSlot(null);
    setEventTitle(event.title);
    setEventDescription(event.description || '');
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedEvent(null);
    setSelectedSlot(null);
    setEventTitle('');
    setEventDescription('');
  };

  if (!accessToken) {
    return (
      <div className="calendar-login-container">
        <div className="google-login-card">
          <img src="https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg" alt="Google Calendar" className="google-logo" />
          <h2>Sign in to Google Calendar</h2>
          <p>Manage your schedule directly from Walter System</p>
          <button onClick={() => login()} className="google-login-btn">
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="google-calendar-layout">
      <div className="google-sidebar">
        <div className="sidebar-header">
          <button className="create-btn" onClick={() => {
            const now = new Date();
            now.setMinutes(0, 0, 0);
            const end = new Date(now);
            end.setHours(end.getHours() + 1);
            handleSelectSlot({ start: now, end });
          }}>
            <svg width="36" height="36" viewBox="0 0 36 36"><path fill="#34A853" d="M16 16v14h4V20z"></path><path fill="#4285F4" d="M30 16H20l-4 4h14z"></path><path fill="#FBBC05" d="M6 16v4h10l4-4z"></path><path fill="#EA4335" d="M20 16V6h-4v14z"></path><path fill="none" d="M0 0h36v36H0z"></path></svg>
            <span className="create-btn-text">Create</span>
          </button>
        </div>
        
        <div className="mini-calendar-wrapper">
           <div className="mini-cal-header">
             <span>{moment(date).format('MMMM YYYY')}</span>
             <div className="mini-cal-nav">
               <span>‹</span><span>›</span>
             </div>
           </div>
           <div className="mini-cal-grid">
             {['S','M','T','W','T','F','S'].map(d => <div key={d} className="mini-cal-day-header">{d}</div>)}
             {Array.from({length: 35}).map((_, i) => (
               <div key={i} className={`mini-cal-day ${i === 15 ? 'active' : ''}`}>{i % 30 + 1}</div>
             ))}
           </div>
        </div>

        <div className="my-calendars">
          <div className="section-header">
            <span>My calendars</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 7.84L12 12.42l4.59-4.58L18 9.25l-6 6-6-6z"/></svg>
          </div>
          <div className="calendar-list-item">
            <input type="checkbox" checked readOnly />
            <span className="cal-color" style={{backgroundColor: '#039BE5'}}></span>
            <span>David Těšínský</span>
          </div>
          <div className="calendar-list-item">
            <input type="checkbox" checked readOnly />
            <span className="cal-color" style={{backgroundColor: '#33B679'}}></span>
            <span>Birthdays</span>
          </div>
          <div className="calendar-list-item">
            <input type="checkbox" readOnly />
            <span className="cal-color" style={{backgroundColor: '#F4511E'}}></span>
            <span>Tasks</span>
          </div>
        </div>
      </div>

      <div className="main-calendar-area">
        <DnDCalendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '100%' }}
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          onEventDrop={onEventDrop}
          onEventResize={onEventResize}
          selectable
          resizable
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          components={{
            toolbar: CustomToolbar
          }}
          step={60}
          showMultiDayTimes
        />
      </div>

      {showModal && (
        <div className="google-modal-overlay" onClick={closeModal}>
          <div className="google-modal" onClick={e => e.stopPropagation()}>
            <div className="google-modal-header">
              {selectedEvent && (
                <div className="modal-actions">
                  <button onClick={handleDeleteEvent} className="icon-btn" title="Delete">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                  </button>
                  <button onClick={closeModal} className="icon-btn" title="Close">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                  </button>
                </div>
              )}
              {!selectedEvent && (
                 <button onClick={closeModal} className="icon-btn close-only" title="Close">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                  </button>
              )}
            </div>
            <div className="google-modal-content">
              <input
                type="text"
                placeholder="Add title"
                className="google-input-title"
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                autoFocus
              />
              <div className="event-time-row">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#5f6368"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/><path d="M12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
                <span>
                  {selectedSlot && moment(selectedSlot.start).format('dddd, MMMM D')}
                  {' ⋅ '}
                  {selectedSlot && moment(selectedSlot.start).format('h:mm A')} – {selectedSlot && moment(selectedSlot.end).format('h:mm A')}
                </span>
              </div>
              <div className="event-desc-row">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#5f6368"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
                <textarea
                  placeholder="Add description"
                  className="google-textarea"
                  value={eventDescription}
                  onChange={(e) => setEventDescription(e.target.value)}
                />
              </div>
            </div>
            <div className="google-modal-footer">
              <button className="google-save-btn" onClick={selectedEvent ? () => handleUpdateEvent({ event: selectedEvent, start: selectedEvent.start, end: selectedEvent.end }) : handleCreateEvent}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarView;
