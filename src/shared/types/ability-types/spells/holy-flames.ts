import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class HolyFlame implements IAbility {
  private static instance: HolyFlame;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
holy flame
Syntax: c 'holy flame' <victim> OR c 'holy flame' <direction> <target>

A holy flame is a tool of the priest in which he/she can send a wrath of
holy flames powerful enough to travel in a given direction.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (HolyFlame.instance === undefined) {
      HolyFlame.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): HolyFlame {
    if (!HolyFlame.instance) {
      HolyFlame.instance = new HolyFlame();
    }
    return HolyFlame.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return HolyFlame.GetInstance() as T;
  }
}

export default HolyFlame;
