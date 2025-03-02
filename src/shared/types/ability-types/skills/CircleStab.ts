import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class CircleStab implements IAbility {
  private static instance: CircleStab;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
circle stab
Syntax: circlestab <victim>

The circle stab is an art of the bladesong which allows the bladesinger to
stab the opponent after they have already disoriented them.  The circle stab
is performed through a quick movement and the bladesinger uses their
sheathed weapon and not their primary weapon.  The bladesinger has from time
to time been able to knock loose a victim's shield, however, from time to
time their sheathed weapon has also been known to get stuck in the victim's
shield. 
`;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Passive;
    this.manualDescription = "";

    if (CircleStab.instance === undefined) {
      CircleStab.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): CircleStab {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CircleStab.GetInstance() as T;
  }
}

export default CircleStab;
