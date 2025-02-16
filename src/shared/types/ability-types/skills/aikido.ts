import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Aikido implements IAbility {
  private static instance: Aikido;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Aikido";
    this.helpFile = `help Aikido
AIKIDO
AIKIDO

Syntax: Passive Skill

The samurai is trained in martial arts, allowing them to use their opponents
momentum to their advantage.  When an enemy strikes at the samurai, they
use their arts to avoid the strike and turn that momentum into an extra
attack during the next round of combat.  

It is rumored that proficiency with this skill improves as the Samurai rises
in rank.  

SEE ALSO: SAMURAI`;

    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Passive;

    if (Aikido.instance === undefined) {
      Aikido.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Aikido {
    if (!Aikido.instance) {
      Aikido.instance = new Aikido();
    }
    return Aikido.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Aikido.GetInstance() as T;
  }
}

export default Aikido;
