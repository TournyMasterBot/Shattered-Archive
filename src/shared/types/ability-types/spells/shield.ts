import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Shield implements IAbility {
  private static instance: Shield;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  abilityBuffCommand?: string | undefined;
  abilityBuffVariable?: string | undefined;
  manualDescription: string;

  constructor() {
    this.name = "Shield";
    this.helpFile = `
help 'Shield'

SHIELD 'STONE SKIN'
SHIELD 'STONE SKIN'

Syntax: cast shield
Syntax: cast 'stone skin'

These spells protect the caster by decreasing (improving) the caster's armor
class.  SHIELD provides 20 points off armor.  STONE SKIN provides 40 points off
armor.
        `;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.abilityBuffCommand = "c shield";

    if (Shield.instance === undefined) {
      Shield.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Shield {
    if (!Shield.instance) {
      Shield.instance = new Shield();
    }
    return Shield.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Shield.GetInstance() as T;
  }
}

export default Shield;
