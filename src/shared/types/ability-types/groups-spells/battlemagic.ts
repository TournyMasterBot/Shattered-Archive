import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Absorption from "@shared/types/ability-types/spells/absorption";
import InstantRegeneration from "@shared/types/ability-types/spells/instant-regeneration";
import EnhancedConstitution from "@shared/types/ability-types/spells/enhanced-constitution";
import Solidify from "@shared/types/ability-types/spells/solidify";
import AlterBeast from "@shared/types/ability-types/spells/alter-beast";
import Infuriate from "@shared/types/ability-types/spells/infuriate";
import AuraOfPain from "@shared/types/ability-types/spells/aura-of-pain";
import AncientVow from "@shared/types/ability-types/spells/ancient-vow";
import WindBreath from "@shared/types/ability-types/spells/wind-breath";
import Regenerate from "@shared/types/ability-types/spells/regenerate";
import ServerCache from "@shared/cache/server-cache";

export class Battlemagic implements IAbilityGroup {
  static instance: Battlemagic;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Battlemagic;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      Absorption.GetInstance(),
      InstantRegeneration.GetInstance(),
      EnhancedConstitution.GetInstance(),
      Solidify.GetInstance(),
      AlterBeast.GetInstance(),
      Infuriate.GetInstance(),
      AuraOfPain.GetInstance(),
      AncientVow.GetInstance(),
      WindBreath.GetInstance(),
      Regenerate.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Battlemagic {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Battlemagic.GetInstance() as T;
  }
}

export default Battlemagic;
