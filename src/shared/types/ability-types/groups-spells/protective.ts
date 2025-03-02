import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Armor from "@shared/types/ability-types/spells/armor";
import Fireproof from "@shared/types/ability-types/spells/fireproof";
import Sanctuary from "@shared/types/ability-types/spells/sanctuary";
import ProtectionFire from "@shared/types/ability-types/spells/protection-fire";
import ProximityDispel from "@shared/types/ability-types/spells/proximity-dispel";
import Cancellation from "@shared/types/ability-types/spells/cancellation";
import ProtectionEvil from "@shared/types/ability-types/spells/protection-evil";
import Shield from "@shared/types/ability-types/spells/shield";
import ProtectionCold from "@shared/types/ability-types/spells/protection-cold";
import DispelMagic from "@shared/types/ability-types/spells/dispel-magic";
import ProtectionGood from "@shared/types/ability-types/spells/protection-good";
import StoneSkin from "@shared/types/ability-types/spells/stone-skin";
import ProtectionNeutral from "@shared/types/ability-types/spells/protection-neutral";
import ServerCache from "@shared/cache/server-cache";

export class Protective implements IAbilityGroup {
  static instance: Protective;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Protective;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      Armor.GetInstance(),
      Fireproof.GetInstance(),
      Sanctuary.GetInstance(),
      ProtectionFire.GetInstance(),
      ProximityDispel.GetInstance(),
      Cancellation.GetInstance(),
      ProtectionEvil.GetInstance(),
      Shield.GetInstance(),
      ProtectionCold.GetInstance(),
      DispelMagic.GetInstance(),
      ProtectionGood.GetInstance(),
      StoneSkin.GetInstance(),
      ProtectionNeutral.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Protective {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Protective.GetInstance() as T;
  }
}

export default Protective;
