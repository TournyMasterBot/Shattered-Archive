import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class SpiritOfRetribution implements IAbility {
  private static instance: SpiritOfRetribution;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Spirit of Retribution";
    this.helpFile = `help 'Spirit of Retribution'
SPIRIT OF RETRIBUTION

Syntax: cast 'spirit of retribution' <character>

The shukenja calls on the spirits of the dead to assail his enemies.  All
those in the room not formed with the shukenja will feel this spell's wrath.
Along with its painful strike, the spell has a chance to curse all those it
touches.  Once afflicted by the curse, the shukenja will find casting it no
longer harms them.  

Groups containing this skill: SHUKENJA`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (SpiritOfRetribution.instance === undefined) {
      SpiritOfRetribution.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): SpiritOfRetribution {
    if (!SpiritOfRetribution.instance) {
      SpiritOfRetribution.instance = new SpiritOfRetribution();
    }
    return SpiritOfRetribution.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SpiritOfRetribution.GetInstance() as T;
  }
}

export default SpiritOfRetribution;
