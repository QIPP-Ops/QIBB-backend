const {
  isOperationManagerUser,
  isCrossCrewChatViewer,
  canViewRoom,
  canPostInRoom,
  canDeleteMessage,
  canModerateRoom,
} = require('../services/chatAccessService');

describe('chatAccessService', () => {
  const superAdmin = { email: 'admin@acwaops.com', crew: 'A', accessRole: 'admin' };
  const bandar = { email: 'bandar@acwaops.com', crew: 'A', role: 'Plant Manager', name: 'Bandar Aldogaish' };
  const crewAdmin = { email: 'admin-a@acwaops.com', crew: 'A', accessRole: 'admin' };
  const crewMember = { email: 'user@acwaops.com', crew: 'A', accessRole: 'viewer' };
  const crewBRoom = { _id: '1', crew: 'B', name: 'Crew B', type: 'crew', postingMode: 'open', restrictedPosters: [] };
  const crewARoom = { _id: '2', crew: 'A', name: 'Crew A', type: 'crew', postingMode: 'open', restrictedPosters: [] };

  test('operation manager detected for Bandar plant manager role', () => {
    expect(isOperationManagerUser(bandar)).toBe(true);
  });

  test('super admin and operation manager have cross-crew visibility', () => {
    expect(isCrossCrewChatViewer(superAdmin)).toBe(true);
    expect(isCrossCrewChatViewer(bandar)).toBe(true);
    expect(isCrossCrewChatViewer(crewMember)).toBe(false);
  });

  test('crew member can view own crew room only', () => {
    expect(canViewRoom(crewMember, crewARoom)).toBe(true);
    expect(canViewRoom(crewMember, crewBRoom)).toBe(false);
    expect(canViewRoom(bandar, crewBRoom)).toBe(true);
  });

  test('read_only room blocks regular members from posting', () => {
    const readOnly = { ...crewARoom, postingMode: 'read_only' };
    expect(canPostInRoom(crewMember, readOnly, crewMember)).toBe(false);
    expect(canPostInRoom(crewAdmin, readOnly, crewAdmin)).toBe(true);
  });

  test('restricted posters cannot post in open room', () => {
    const restricted = { ...crewARoom, restrictedPosters: ['user-id'] };
    const blocked = { userId: 'user-id', crew: 'A', accessRole: 'viewer' };
    expect(canPostInRoom(blocked, restricted, blocked)).toBe(false);
  });

  test('author can delete own message; crew admin can moderate', () => {
    const msg = { authorId: 'u1' };
    expect(canDeleteMessage({ userId: 'u1' }, msg, crewARoom)).toBe(true);
    expect(canDeleteMessage(crewMember, msg, crewARoom)).toBe(false);
    expect(canDeleteMessage(crewAdmin, msg, crewARoom)).toBe(true);
    expect(canModerateRoom(bandar, crewBRoom)).toBe(true);
  });

  test('dm rooms are visible only to participants', () => {
    const dmRoom = {
      _id: 'dm1',
      type: 'dm',
      crew: 'DM',
      participants: ['u1', 'u2'],
      postingMode: 'open',
      restrictedPosters: [],
    };
    expect(canViewRoom({ userId: 'u1' }, dmRoom)).toBe(true);
    expect(canViewRoom({ userId: 'u3' }, dmRoom)).toBe(false);
    expect(canViewRoom(bandar, dmRoom)).toBe(false);
  });

  test('dm participants can post; non-participants cannot', () => {
    const dmRoom = {
      _id: 'dm1',
      type: 'dm',
      crew: 'DM',
      participants: ['u1', 'u2'],
      postingMode: 'read_only',
      restrictedPosters: [],
    };
    const participant = { userId: 'u1', crew: 'A', accessRole: 'viewer' };
    const outsider = { userId: 'u9', crew: 'A', accessRole: 'viewer' };
    expect(canPostInRoom(participant, dmRoom, participant)).toBe(true);
    expect(canPostInRoom(outsider, dmRoom, outsider)).toBe(false);
  });
});
