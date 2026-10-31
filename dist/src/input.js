export function keyboardTurn(keys, dt, speed = 1.8) {
  const direction = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
  return direction * speed * dt;
}
