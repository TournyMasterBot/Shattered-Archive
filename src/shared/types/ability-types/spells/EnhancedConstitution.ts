import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class EnhancedConstitution implements IAbility {
  private static instance: EnhancedConstitution;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
ENHANCED CONSTITUTION

Syntax: cast 'enhanced constitution'

Learned only by the battlemage, this spell significantly enhances the
overall life force of the mage while in any condition of health, allowing
them to absorb additional physical or magical damage in battle before facing
potential death. The higher a mage's casting level, the better the overall
result. There is a very considerable time lapse between each casting of
this spell.  

Groups containing this spell: Battlemagic

SEE ALSO: BATTLEMAGE, BATTLEMAGIC

Updated 03.19.2021
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (EnhancedConstitution.instance === undefined) {
      EnhancedConstitution.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): EnhancedConstitution {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return EnhancedConstitution.GetInstance() as T;
  }
}

export default EnhancedConstitution;
