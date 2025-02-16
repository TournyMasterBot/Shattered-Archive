import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class SpiritOfProtection implements IAbility {
  private static instance: SpiritOfProtection;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Spirit of Protection";
    this.helpFile = `help 'Spirit of Protection'
SPIRIT OF PROTECTION

Syntax: cast 'spirit of protection'

The shukenja is able to conjure a swirling mist to cover himself and all
those formed with him for a short time.  This mist protects he and his
allies from all forms of magical spell damage.  It is not effective against
weapons.  

Groups containing this skill: SHUKENJA`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (SpiritOfProtection.instance === undefined) {
      SpiritOfProtection.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): SpiritOfProtection {
    if (!SpiritOfProtection.instance) {
      SpiritOfProtection.instance = new SpiritOfProtection();
    }
    return SpiritOfProtection.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return SpiritOfProtection.GetInstance() as T;
  }
}

export default SpiritOfProtection;
