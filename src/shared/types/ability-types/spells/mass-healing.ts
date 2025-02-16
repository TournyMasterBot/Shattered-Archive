import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class MassHealing implements IAbility {
  private static instance: MassHealing;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Mass Healing";
    this.helpFile = `
help 'Mass Healing'
MASS HEALING
Syntax: cast 'mass healing'

The mass healing spell, as its name might suggest, performs a healing spell
on all players in the room. It also throws in a refresh spell for good
measure.
        `;
    this.abilityGroupType = AbilityGroupType.Spells; // Set to 'Spells'
    this.abilityUsage = AbilityUsage.Active;

    if (MassHealing.instance === undefined) {
      MassHealing.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): MassHealing {
    if (!MassHealing.instance) {
      MassHealing.instance = new MassHealing();
    }
    return MassHealing.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return MassHealing.GetInstance() as T;
  }
}

export default MassHealing;
