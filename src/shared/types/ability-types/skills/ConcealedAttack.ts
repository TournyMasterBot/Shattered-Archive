import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ConcealedAttack implements IAbility {
  private static instance: ConcealedAttack;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'concealed attack'
mastery dagger stab hurl concealed attack
Mastery of the Dagger

Few combatants are so skilled in combat with a dagger as an armsman. Having
devoted themselves to mastery of the dagger, they may use the following skills:

stab             A fast piercing attack specialized to inflict damage upon
                 an enemy combatant.
hurl             An attack made with a small throwing dagger, resulting in
                 varying deleterious effects to the victim depending on the
                 blade's point of impact.
concealed attack An innate, reflexive reaction to being attacked that damages
                 the assailant in turn.

This group is available to the following classes: ARMSMAN
`;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Passive;
    this.manualDescription = "";

    if (ConcealedAttack.instance === undefined) {
      ConcealedAttack.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ConcealedAttack {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ConcealedAttack.GetInstance() as T;
  }
}

export default ConcealedAttack;
