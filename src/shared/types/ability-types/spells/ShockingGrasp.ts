import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ShockingGrasp implements IAbility {
  private static instance: ShockingGrasp;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Shocking Grasp'
'SHOCKING GRASP'
'SHOCKING GRASP'

Syntax: cast 'shocking grasp' <target>

Adding that final element, literally, to the book of combat spells, the
shocking grasp offers the caster an even greater potential for offensive
damage than its siblings.

Once this spell is learned, the caster begins training in greater, more
damaging, and in most cases, more specialized spells of combat.

See also - COMBAT
        `;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (ShockingGrasp.instance === undefined) {
      ShockingGrasp.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ShockingGrasp {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ShockingGrasp.GetInstance() as T;
  }
}

export default ShockingGrasp;
