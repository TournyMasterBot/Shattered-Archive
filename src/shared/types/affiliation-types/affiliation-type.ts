enum AffiliationTypes {
  /// <summary>
  /// Room has no known affiliations
  /// </summary>
  Unknown = 0,
  /// <summary>
  /// Room is not restricted
  /// </summary>
  None = 1 << 0,
  /// <summary>
  /// Room is restricted to a specific kingdom
  /// </summary>
  Kingdom = 1 << 1,
  /// <summary>
  /// Room is restricted to a specific clan
  /// </summary>
  Clan = 1 << 2,
  /// <summary>
  /// Room is restricted to a specific diety
  /// </summary>
  Religion = 1 << 3,
  /// <summary>
  /// Room is restricted to a specific class
  /// </summary>
  Class = 1 << 4,
  /// <summary>
  /// Room is restricted by level requirements
  /// </summary>
  Level = 1 << 5,
  /// <summary>
  /// Room is restricted to the owner (and invited players)
  /// </summary>
  Owner = 1 << 6,
  /// <summary>
  /// Room has a maximum number of things in the room
  /// </summary>
  Capacity = 1 << 7,
  /// <summary>
  /// Restricted to a specific race
  /// </summary>
  Race = 1 << 8
}
export default AffiliationTypes;
