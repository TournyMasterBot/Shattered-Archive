import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Haste implements IAbility {
  private static instance: Haste;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  abilityBuffCommand?: string | undefined;
  abilityBuffVariable?: string | undefined;

  constructor() {
    this.name = "Haste";
    this.helpFile = `
help Haste
HASTE
HASTE

Syntax: cast 'haste' <target>

The haste spell increases the speed and agility of the recipient, allowing
an extra attack (or even a backstab) in combat, and improving evasive
abilities in combat.  

However, it produces a great strain on the system, such that recuperative
abilities are halved. Haste is capable of negating the slow spell.  

See also - ENHANCEMENT SLOW`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.abilityBuffCommand = "c haste";

    if (Haste.instance === undefined) {
      Haste.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Haste {
    if (!Haste.instance) {
      Haste.instance = new Haste();
    }
    return Haste.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Haste.GetInstance() as T;
  }
}

export default Haste;
