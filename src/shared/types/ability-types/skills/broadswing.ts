import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Broadswing implements IAbility {
  private static instance: Broadswing;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
BROADSWING

Syntax: broadswing <target>

The proud order of Shadowknights have in their repertoire the dangerous
skill known as broadswinging. A mounted knight may, when armed with a
sword, attempt to charge into battle to deal a devastating blow with their
blade. However, this attack depends upon surprise, as a wary opponent may
simply move out of the way or, worse yet, the knight may find himself in the
dirt looking the fool.
        `;

    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.manualDescription = "";

    if (Broadswing.instance === undefined) {
      Broadswing.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Broadswing {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Broadswing.GetInstance() as T;
  }
}

export default Broadswing;
