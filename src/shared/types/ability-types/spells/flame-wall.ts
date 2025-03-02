import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class FlameWall implements IAbility {
  private static instance: FlameWall;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help wujen
Flame Wall - The Wu Jen conjures a wall of flame in the room, blinding all
enemies who witness its creation for a time. The flame wall lingers in the
room for awhile after, and the smoke from the burning barrier can
occasionally cause spellcasters to choke and fail the spells they are
casting.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (FlameWall.instance === undefined) {
      FlameWall.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): FlameWall {
    if (!FlameWall.instance) {
      FlameWall.instance = new FlameWall();
    }
    return FlameWall.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return FlameWall.GetInstance() as T;
  }
}

export default FlameWall;
