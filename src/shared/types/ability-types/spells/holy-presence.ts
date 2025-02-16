import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class HolyPresence implements IAbility {
  private static instance: HolyPresence;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Holy Presence";
    this.helpFile = `
holy presence
Syntax: c 'holy presence' <target>

A priest can bestow a holy presence upon a worthy individual which helps to
protect that person from physical harm.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (HolyPresence.instance === undefined) {
      HolyPresence.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): HolyPresence {
    if (!HolyPresence.instance) {
      HolyPresence.instance = new HolyPresence();
    }
    return HolyPresence.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return HolyPresence.GetInstance() as T;
  }
}

export default HolyPresence;
